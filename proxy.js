#!/usr/bin/env node

'use strict';

var express = require('express'),
    url = require('url'),
    proxy = require('proxy-middleware'),
    session = require('cookie-session'),
    http = require('http');

var gSessions = {};
var gProxyMiddlewareCache = {};
var gApp = express();
var gHttpServer = http.createServer(gApp);

var CALLBACK_URI = '/callback';

gHttpServer.on('error', console.error);

gApp.use(session({
    keys: ['blue', 'cheese', 'is', 'something']
}));

gApp.use(function (req, res, next) {
    if (req.session && gSessions[req.session.sessid]) return next();

    if (req.path === CALLBACK_URI) {
        // FIXME we need to exchange the authCode and verify it
        req.session.sessid = req.query.authCode;

        // this is a simple in memory auth store
        gSessions[req.session.sessid] = 'ok';

        // now redirect to the actual initially requested URL
        res.redirect(req.session.returnTo);
    } else {
        var forwardedHost = req.headers['x-forwarded-host'];
        var forwardedProto = req.headers['x-forwarded-proto'];
        var port = parseInt(req.headers['x-cloudron-proxy-port'], 10);

        if (!forwardedProto) return res.send(500, 'Routing error. No forwarded protocol.');
        if (!forwardedHost) return res.send(500, 'Routing error. No forwarded host.');
        if (!Number.isFinite(port)) return res.send(500, 'Routing error. No forwarded port.');

        req.session.port = port;
        req.session.returnTo =  forwardedProto + '://' + forwardedHost + req.path;

        var callbackURL = forwardedProto + '://' + forwardedHost + CALLBACK_URI;
        var scope = 'root,profile,apps,roleAdmin';
        var clientId = 'cid-proxy';
        var oauthLogin = 'https://admin-localhost/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + clientId + '&redirect_uri=' + callbackURL + '&scope=' + scope;

        // begin the OAuth flow
        res.redirect(oauthLogin);
    }
});

gApp.use(function (req, res, next) {
    var port = req.session.port;

    var proxyMiddleware = gProxyMiddlewareCache[port];
    if (!proxyMiddleware) {
        console.log('Adding proxy middleware for port %d', port);

        proxyMiddleware = proxy(url.parse('http://127.0.0.1:' + port));
        gProxyMiddlewareCache[port] = proxyMiddleware;
    }

    proxyMiddleware(req, res, next);
});

gHttpServer.listen(4000, function () {
    console.log('Proxy server listening...');
});
