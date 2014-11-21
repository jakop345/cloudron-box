#!/usr/bin/env node

/* jslint node: true */

'use strict';

var announce = require('./announce.js'),
    assert = require('assert'),
    async = require('async'),
    connectLastMile = require('connect-lastmile'),
    debug = require('debug')('box:install/server'),
    express = require('express'),
    fs = require('fs'),
    http = require('http'),
    HttpError = connectLastMile.HttpError,
    https = require('https'),
    HttpSuccess = connectLastMile.HttpSuccess,
    installer = require('./installer.js'),
    middleware = require('../middleware'),
    path = require('path'),
    superagent = require('superagent');

exports = module.exports = {
    start: start,
    stop: stop
};

var gHttpsServer = null, // external server; used for install/restore
    gHttpServer = null; // internal server; used for updates

function restore(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.token !== 'string') return next(new HttpError(400, 'No token provided'));
    if (typeof req.body.appServerUrl !== 'string') return next(new HttpError(400, 'No appServerUrl provided'));
    if (typeof req.body.fqdn !== 'string') return next(new HttpError(400, 'No fqdn provided'));
    if (typeof req.body.restoreUrl !== 'string') return next(new HttpError(400, 'No restoreUrl provided'));
    if (typeof req.body.version !== 'string') return next(new HttpError(400, 'No version provided'));
    if (typeof req.body.boxVersionsUrl !== 'string') return next(new HttpError(400, 'No boxVersionsUrl provided'));
    if (!('tls' in req.body)) return next(new HttpError(400, 'tls cert must be provided or be null'));

    debug('restore: received from appstore ', req.body);

    installer.restore(req.body, function (error) {
        if (error) console.error(error);

        stopExternalServer(function () { });
    });

    announce.stop(function () { });

    next(new HttpSuccess(202, { }));
}

function provision(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.token !== 'string') return next(new HttpError(400, 'No token provided'));
    if (typeof req.body.appServerUrl !== 'string') return next(new HttpError(400, 'No appServerUrl provided'));
    if (typeof req.body.fqdn !== 'string') return next(new HttpError(400, 'No fqdn provided'));
    if (typeof req.body.version !== 'string') return next(new HttpError(400, 'No version provided'));
    if (typeof req.body.boxVersionsUrl !== 'string') return next(new HttpError(400, 'No boxVersionsUrl provided'));
    if (!('tls' in req.body)) return next(new HttpError(400, 'tls cert must be provided or be null'));

    debug('provision: received from appstore ' + req.body.appServerUrl);

    installer.provision(req.body, function (error) {
        if (error) console.error(error);

        stopExternalServer(function () { });
    });

    announce.stop(function () { });

    next(new HttpSuccess(202, { }));
}

function update(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.token !== 'string') return next(new HttpError(400, 'No token provided'));
    if (typeof req.body.appServerUrl !== 'string') return next(new HttpError(400, 'No appServerUrl provided'));
    if (typeof req.body.fqdn !== 'string') return next(new HttpError(400, 'No fqdn provided'));
    if (typeof req.body.version !== 'string') return next(new HttpError(400, 'No version provided'));
    if (typeof req.body.boxVersionsUrl !== 'string') return next(new HttpError(400, 'No boxVersionsUrl provided'));
    if (!('tls' in req.body)) return next(new HttpError(400, 'tls cert must be provided or be null'));

    debug('update: started');

    installer.update(req.body, function (error) {
        if (error) console.error(error);
    });

    next(new HttpSuccess(202, { }));
}

function startInternalServer(callback) {
    assert(typeof callback === 'function');

    debug('Starting internal server');

    var app = express();

    var router = new express.Router();

    app.use(middleware.json({ strict: true }))
       .use(middleware.morgan({ format: 'dev', immediate: false }))
       .use(router)
       .use(connectLastMile.successHandler)
       .use(connectLastMile.clientErrorHandler)
       .use(connectLastMile.serverErrorHandler);

    router.post('/api/v1/installer/update', update);

    gHttpServer = http.createServer(app);
    gHttpServer.on('error', console.error);

    gHttpServer.listen(2020, '127.0.0.1', callback);
}

function startExternalServer(callback) {
    assert(typeof callback === 'function');

    debug('Starting external server');

    var app = express();

    var router = new express.Router();

    app.use(middleware.json({ strict: true }))
       .use(middleware.morgan({ format: 'dev', immediate: false }))
       .use(router)
       .use(connectLastMile.successHandler)
       .use(connectLastMile.clientErrorHandler)
       .use(connectLastMile.serverErrorHandler);

    router.post('/api/v1/installer/provision', provision);
    router.post('/api/v1/installer/restore', restore);

    var options = {
      key: fs.readFileSync(path.join(__dirname, 'cert/host.key')),
      cert: fs.readFileSync(path.join(__dirname, 'cert/host.cert'))
    };

    gHttpsServer = https.createServer(options, app);
    gHttpsServer.on('error', console.error);

    gHttpsServer.listen(process.env.NODE_ENV === 'test' ? 4443 : 443, '0.0.0.0', callback);
}

function stopExternalServer(callback) {
    assert(typeof callback === 'function');

    debug('Stopping external server');

    if (!gHttpsServer) return callback(null);

    gHttpsServer.close(callback);
    gHttpsServer = null;
}

function stopInternalServer(callback) {
    assert(typeof callback === 'function');

    debug('Stopping internal server');

    if (!gHttpServer) return callback(null);

    gHttpServer.close(callback);
    gHttpServer = null;
}

function start(mode, callback) {
    assert(mode === 'internal' || mode == 'external', 'invalid mode');
    assert(typeof callback === 'function');

    if (mode === 'internal') {
        debug('starting in internal mode');
        return startInternalServer(callback);
    }

    debug('starting in external mode');

    superagent.get('http://169.254.169.254/metadata/v1.json').end(function (error, result) {
        if (error || result.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return;
        }

        var appServerUrl = JSON.parse(result.body.user_data).appServerUrl;
        debug('Using appServerUrl from metadata: ', appServerUrl);

        async.series([
            announce.start.bind(null, appServerUrl),
            startExternalServer
        ], callback);
    });
}

function stop(callback) {
    assert(typeof callback === 'function');

    async.series([
        announce.stop,
        stopInternalServer,
        stopExternalServer
    ], callback);
}

if (require.main === module) {
    if (process.argv.length !== 3) {
        console.log('Usage: node server.js [internal|external]');
        return;
    }

    start(process.argv[2]);
}

