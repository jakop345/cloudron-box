#!/usr/bin/env node

'use strict';

var assert = require('assert'),
    debug = require('debug')('installer:server'),
    express = require('express'),
    fs = require('fs'),
    http = require('http'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    installer = require('./installer.js'),
    json = require('body-parser').json,
    lastMile = require('connect-lastmile'),
    morgan = require('morgan');

exports = module.exports = {
    start: start,
    stop: stop
};

var gHttpServer = null; // update server; used for updates

function update(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (!req.body.sourceTarballUrl || typeof req.body.sourceTarballUrl !== 'string') return next(new HttpError(400, 'No sourceTarballUrl provided'));
    if (!req.body.data || typeof req.body.data !== 'object') return next(new HttpError(400, 'No data provided'));

    debug('provision: received from box %j', req.body);

    installer.provision(req.body, function (error) {
        if (error) console.error(error);
    });

    next(new HttpSuccess(202, { }));
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Starting update server');

    var app = express();

    var router = new express.Router();

    if (process.env.NODE_ENV !== 'test') app.use(morgan('dev', { immediate: false }));

    app.use(json({ strict: true }))
       .use(router)
       .use(lastMile());

    router.post('/api/v1/installer/update', update);

    gHttpServer = http.createServer(app);
    gHttpServer.on('error', console.error);

    gHttpServer.listen(2020, '127.0.0.1', callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Stopping update server');

    if (!gHttpServer) return callback(null);

    gHttpServer.close(callback);
    gHttpServer = null;
}

function provisionCaaS(callback) {
    var PROVISION_CONFIG_FILE = '/root/userdata.json';

    if (fs.existsSync(PROVISION_CONFIG_FILE)) {
        var userData = require(PROVISION_CONFIG_FILE);
        installer.provision(userData, callback);
    }
}

if (require.main === module) {
    provisionCaaS(function (error) {
        if (error) return console.error(error);

        start(function (error) {
            if (error) console.error(error);
        });
    });
}
