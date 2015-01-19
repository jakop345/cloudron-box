#!/usr/bin/env node

'use strict';

var express = require('express'),
    url = require('url'),
    proxy = require('proxy-middleware'),
    session = require('cookie-session'),
    http = require('http');

var gSessions = {};
var gApp = express();
var gHttpServer = http.createServer(gApp);

gHttpServer.on('error', console.error);

gApp.use(session({
    keys: ['blue', 'cheese', 'is', 'something']
}));

gApp.use(function (req, res, next) {
    if (req.session && gSessions[req.session.sessid]) return next();

    if (req.path === '/login_callback.html') {
        // FIXME we need to exchange the authCode and verify it
        req.session.sessid = req.query.authCode;
        gSessions[req.session.sessid] = 'ok';

        console.log('FIXME: this is not secure, only the authCode: %s.', req.query.authCode);

        next();
    } else {
        var callbackURL = 'http://localhost:4000/login_callback.html';
        var scope = 'root,profile,apps,roleAdmin';
        var clientId = 'cid-proxy';
        var oauthLogin = 'https://admin-localhost/api/v1/oauth/dialog/authorize?response_type=code&client_id=' + clientId + '&redirect_uri=' + callbackURL + '&scope=' + scope;

        res.redirect(oauthLogin);
    }
});

gApp.use(proxy(url.parse('http://localhost:8000')));

gHttpServer.listen(4000, function () {
    console.log('Proxy server listening...');
});
