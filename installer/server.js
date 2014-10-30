#!/usr/bin/env node

/* jslint node: true */

'use strict';

var assert = require('assert'),
    debug = require('debug')('box:install/server'),
    express = require('express'),
    fs = require('fs'),
    https = require('https'),
    installer = require('./installer.js'),
    middleware = require('../middleware'),
    onFinished = require('on-finished'),
    os = require('os'),
    path = require('path'),
    superagent = require('superagent');

exports = module.exports = {
    start: start,
    stop: stop
};

var gAnnounceTimerId = null,
    gHttpsServer = null;

function restore(req, res, next) {
    if (!req.body.token) return res.status(400).send('No token provided');
    if (!req.body.appServerUrl) return res.send(400).send('No appServerUrl provided');
    if (!req.body.isDev) return res.status(400).send('No isDev provided');
    if (!req.body.fqdn) return res.status(400).send('No fqdn provided');
    if (!req.body.restoreUrl) return res.status(400).send('No restoreUrl provided');
    if (!req.body.revision) return res.status(400).send('No revision provided');
    if (!('tls' in req.body)) return res.status(400).send('tls cert must be provided or be null');

    debug('restore: received from appstore ', req.body);

    // the appstore gives us 3m to respond
    installer.restore(req.body, function (error) {
        if (error) return res.status(500).send(error.message);

        res.status(200).send({ });
    });

    onFinished(res, setTimeout.bind(null, 5000, process.exit.bind(null, 0)));
}

function provision(req, res, next) {
    if (!req.body.token) return res.status(400).send('No token provided');
    if (!req.body.appServerUrl) return res.status(400).send('No appServerUrl provided');
    if (!req.body.isDev) return res.status(400).send('No isDev provided');
    if (!req.body.fqdn) return res.status(400).send('No fqdn provided');
    if (!req.body.revision) return res.status(400).send('No revision provided');
    if (!('tls' in req.body)) return res.status(400).send('tls cert must be provided or be null');

    debug('provision: received from appstore ' + req.body.appServerUrl);

    // the appstore gives us 3m to respond
    installer.provision(req.body, function (error) {
        if (error) return res.status(500).send(error.message);

        res.status(201).send({ });
    });

    onFinished(res, setTimeout.bind(null, 5000, process.exit.bind(null, 0)));
}

function start(appServerUrl, callback) {
    assert(typeof appServerUrl === 'string');
    assert(!callback || typeof callback === 'function');

    var app = express();

    var router = new express.Router();

    app.use(middleware.json({ strict: true }))
       .use(middleware.morgan({ format: 'dev', immediate: false }))
       .use(router);

    router.post('/api/v1/provision', provision);
    router.post('/api/v1/restore', restore);

    var options = {
      key: fs.readFileSync(path.join(__dirname, 'cert/host.key')),
      cert: fs.readFileSync(path.join(__dirname, 'cert/host.cert'))
    };

    gHttpsServer = https.createServer(options, app);
    gHttpsServer.on('error', console.error);
    gHttpsServer.listen(process.env.NODE_ENV === 'test' ? 4443: 443, callback);

    announce(appServerUrl);
}

function stop(callback) {
    assert(!callback || typeof callback === 'function');

    clearTimeout(gAnnounceTimerId);

    gHttpsServer.close(callback);
}

function announce(appServerUrl) {
    var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = appServerUrl + '/api/v1/boxes/' + hostname + '/announce';
    debug('announce: box with %s.', url);

    superagent.get(url).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('announce: unable to announce to app server, try again.', error);
            gAnnounceTimerId = setTimeout(announce.bind(null, appServerUrl), ANNOUNCE_INTERVAL);
            return;
        }

        gAnnounceTimerId = setTimeout(announce.bind(null, appServerUrl), ANNOUNCE_INTERVAL * 2);

        debug('announce: success');
    });
};

if (require.main === module) {
    if (process.argv.length <= 2) {
        console.error('appstore url not provided as argument');
        return;
    }

    start(process.argv[2]);
}

