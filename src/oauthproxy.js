'use strict';

exports = module.exports = {
    start: start,
    stop: stop
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    clientdb = require('./clientdb.js'),
    config = require('./config.js'),
    debug = require('debug')('box:proxy'),
    express = require('express'),
    http = require('http'),
    proxy = require('proxy-middleware'),
    session = require('cookie-session'),
    superagent = require('superagent'),
    url = require('url'),
    uuid = require('node-uuid');

var gSessions = {};
var gProxyMiddlewareCache = {};
var gHttpServer = null;

var CALLBACK_URI = '/callback';

function attachSessionData(req, res, next) {
    assert.strictEqual(typeof req.session, 'object');

    if (!req.session.id || !gSessions[req.session.id]) {
        req.session.id = uuid.v4();
        gSessions[req.session.id] = {};
    }

    // attach the session data to the requeset
    req.sessionData = gSessions[req.session.id];

    next();
}

function verifySession(req, res, next) {
    assert.strictEqual(typeof req.sessionData, 'object');

    if (!req.sessionData.accessToken) {
        req.authenticated = false;
        return next();
    }

    // use http admin origin so that it works with self-signed certs
    superagent
        .get(config.internalAdminOrigin() + '/api/v1/profile')
        .query({ access_token: req.sessionData.accessToken})
        .end(function (error, result) {
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
}

function authenticate(req, res, next) {
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

        // use http admin origin so that it works with self-signed certs
        superagent
            .post(config.internalAdminOrigin() + '/api/v1/oauth/token')
            .query(query).send(data)
            .end(function (error, result) {
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
}

function forwardRequestToApp(req, res, next) {
    var port = req.sessionData.port;

    debug('proxy request for port %s with path %s.', port, req.path);

    var proxyMiddleware = gProxyMiddlewareCache[port];
    if (!proxyMiddleware) {
        console.log('Adding proxy middleware for port %d', port);

        proxyMiddleware = proxy(url.parse('http://127.0.0.1:' + port));
        gProxyMiddlewareCache[port] = proxyMiddleware;
    }

    proxyMiddleware(req, res, next);
}

function initializeServer() {
    var app = express();
    var httpServer = http.createServer(app);

    httpServer.on('error', console.error);

    app
        .use(session({ keys: ['blue', 'cheese', 'is', 'something'] }))
        .use(attachSessionData)
        .use(verifySession)
        .use(authenticate)
        .use(forwardRequestToApp);

    return httpServer;
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    gHttpServer = initializeServer();

    gHttpServer.listen(config.get('oauthProxyPort'), callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    gHttpServer.close(callback);
}
