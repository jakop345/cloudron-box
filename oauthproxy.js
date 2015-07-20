#!/usr/bin/env node

'use strict';

require('supererror')({ splatchError: true });

var express = require('express'),
    url = require('url'),
    uuid = require('node-uuid'),
    async = require('async'),
    superagent = require('superagent'),
    assert = require('assert'),
    debug = require('debug')('box:proxy'),
    proxy = require('proxy-middleware'),
    session = require('cookie-session'),
    database = require('./src/database.js'),
    appdb = require('./src/appdb.js'),
    clientdb = require('./src/clientdb.js'),
    config = require('./src/config.js'),
    http = require('http');

// Allow self signed certs!
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var gSessions = {};
var gProxyMiddlewareCache = {};
var gApp = express();
var gHttpServer = http.createServer(gApp);

var CALLBACK_URI = '/callback';
var PORT = 4000;

function startServer(callback) {
    assert.strictEqual(typeof callback, 'function');

    gHttpServer.on('error', console.error);

    gApp.use(session({
        keys: ['blue', 'cheese', 'is', 'something']
    }));

    // ensure we have a in memory store for the session to cache client information
    gApp.use(function (req, res, next) {
        assert.strictEqual(typeof req.session, 'object');

        if (!req.session.id || !gSessions[req.session.id]) {
            req.session.id = uuid.v4();
            gSessions[req.session.id] = {};
        }

        // attach the session data to the requeset
        req.sessionData = gSessions[req.session.id];

        next();
    });

    gApp.use(function verifySession(req, res, next) {
        assert.strictEqual(typeof req.sessionData, 'object');

        if (!req.sessionData.accessToken) {
            req.authenticated = false;
            return next();
        }

        superagent.get(config.adminOrigin() + '/api/v1/profile').query({ access_token: req.sessionData.accessToken}).end(function (error, result) {
            if (error) {
                console.error(error);
                req.authenticated = false;
            } else if (result.statusCode !== 200) {
                req.sessionData.accessToken = null;
                req.authenticated = false;
            } else {
                req.authenticated = true;
            }

            next();
        });
    });

    gApp.use(function (req, res, next) {
        // proceed if we are authenticated
        if (req.authenticated) return next();

        if (req.path === CALLBACK_URI && req.sessionData.returnTo) {
            // exchange auth code for an access token
            var query = {
                response_type: 'token',
                client_id: req.sessionData.clientId
            };

            var data = {
                grant_type: 'authorization_code',
                code: req.query.code,
                redirect_uri: req.sessionData.returnTo,
                client_id: req.sessionData.clientId,
                client_secret: req.sessionData.clientSecret
            };

            superagent.post(config.adminOrigin() + '/api/v1/oauth/token').query(query).send(data).end(function (error, result) {
                if (error) {
                    console.error(error);
                    return res.send(500, 'Unable to contact the oauth server.');
                }
                if (result.statusCode !== 200) {
                    console.error('Failed to exchange auth code for a token.', result.statusCode, result.body);
                    return res.send(500, 'Failed to exchange auth code for a token.');
                }

                req.sessionData.accessToken = result.body.access_token;

                debug('user verified.');

                // now redirect to the actual initially requested URL
                res.redirect(req.sessionData.returnTo);
            });
        } else {
            var port = parseInt(req.headers['x-cloudron-proxy-port'], 10);

            if (!Number.isFinite(port)) {
                console.error('Failed to parse nginx proxy header to get app port.');
                return res.send(500, 'Routing error. No forwarded port.');
            }

            debug('begin verifying user for app on port %s.', port);

            appdb.getByHttpPort(port, function (error, result) {
                if (error) {
                    console.error('Unknown app.', error);
                    return res.send(500, 'Unknown app.');
                }

                clientdb.getByAppId('proxy-' + result.id, function (error, result) {
                    if (error) {
                        console.error('Unkonwn OAuth client.', error);
                        return res.send(500, 'Unknown OAuth client.');
                    }

                    req.sessionData.port = port;
                    req.sessionData.returnTo = result.redirectURI + req.path;
                    req.sessionData.clientId = result.id;
                    req.sessionData.clientSecret = result.clientSecret;

                    var callbackUrl = result.redirectURI + CALLBACK_URI;
                    var scope = 'profile,roleUser';
                    var oauthLogin = config.adminOrigin() + '/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + result.id + '&redirect_uri=' + callbackUrl + '&scope=' + scope;

                    debug('begin OAuth flow for client %s.', result.name);

                    // begin the OAuth flow
                    res.redirect(oauthLogin);
                });
            });
        }
    });

    gApp.use(function (req, res, next) {
        var port = req.sessionData.port;

        debug('proxy request for port %s with path %s.', port, req.path);

        var proxyMiddleware = gProxyMiddlewareCache[port];
        if (!proxyMiddleware) {
            console.log('Adding proxy middleware for port %d', port);

            proxyMiddleware = proxy(url.parse('http://127.0.0.1:' + port));
            gProxyMiddlewareCache[port] = proxyMiddleware;
        }

        proxyMiddleware(req, res, next);
    });

    gHttpServer.listen(PORT, callback);
}

async.series([
    database.initialize,
    startServer
], function (error) {
    if (error) {
        console.error('Failed to start proxy server.', error);
        process.exit(1);
    }

    console.log('Proxy server listening...');
});
