#!/usr/bin/env node

'use strict';

require('supererror')({ splatchError: true });

var express = require('express'),
    url = require('url'),
    async = require('async'),
    superagent = require('superagent'),
    assert = require('assert'),
    debug = require('debug')('box:proxy'),
    proxy = require('proxy-middleware'),
    session = require('cookie-session'),
    database = require('./src/database.js'),
    appdb = require('./src/appdb.js'),
    clientdb = require('./src/clientdb.js'),
    config = require('./config.js'),
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
    assert(typeof callback === 'function');

    gHttpServer.on('error', console.error);

    gApp.use(session({
        keys: ['blue', 'cheese', 'is', 'something']
    }));

    gApp.use(function (req, res, next) {
        if (req.session && gSessions[req.session.sessid]) return next();

        if (req.path === CALLBACK_URI) {
            // exchange auth code for an access token
            var query = {
                response_type: 'token',
                client_id: req.session.clientId
            };

            var data = {
                grant_type: 'authorization_code',
                code: req.query.authCode,
                redirect_uri: req.session.returnTo,
                client_id: req.session.clientId,
                client_secret: req.session.clientSecret
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

                req.session.sessid = result.body.access_token;

                // this is a simple in memory auth store
                gSessions[req.session.sessid] = 'ok';

                debug('user verified.');

                // now redirect to the actual initially requested URL
                res.redirect(req.session.returnTo);
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

                    req.session.port = port;
                    req.session.returnTo =  result.redirectURI + req.path;
                    req.session.clientId = result.id;
                    req.session.clientSecret = result.clientSecret;

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
        var port = req.session.port;

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
