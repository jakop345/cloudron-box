#!/usr/bin/env node

/* jslint node: true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    debug = require('debug')('installer:server'),
    express = require('express'),
    fs = require('fs'),
    http = require('http'),
    HttpError = require('connect-lastmile').HttpError,
    https = require('https'),
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    installer = require('./installer.js'),
    json = require('body-parser').json,
    lastMile = require('connect-lastmile'),
    morgan = require('morgan'),
    path = require('path'),
    safe = require('safetydance'),
    superagent = require('superagent'),
    ts = require('tail-stream');

exports = module.exports = {
    start: start,
    stop: stop
};

var gHttpsServer = null, // provision server; used for install/restore
    gHttpServer = null; // update server; used for updates

// 'data' is opaque. the following code exists to help debugging
function checkData(data) {
    assert.strictEqual(typeof data, 'object');

    if (typeof data.token !== 'string') console.error('No token provided');
    if (typeof data.apiServerOrigin !== 'string') console.error('No apiServerOrigin provided');
    if (typeof data.webServerOrigin !== 'string') console.error('No webServerOrigin provided');
    if (typeof data.fqdn !== 'string') console.error('No fqdn provided');
    if (typeof data.tlsCert !== 'string') console.error('No TLS cert provided');
    if (typeof data.tlsKey !== 'string') console.error('No TLS key provided');
    if (typeof data.isCustomDomain !== 'boolean') console.error('No isCustomDomain provided');
    if (typeof data.version !== 'string') console.error('No version provided');
    if (typeof data.sourceTarballUrl !== 'string') console.error('No sourceTarballUrl provided');

    if ('restoreUrl' in data) {
        if (typeof data.restoreUrl !== 'string') console.error('No restoreUrl provided');
        if (typeof data.restoreKey !== 'string') console.error('No restoreKey provided');
    }
}

function provision(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.sourceTarballUrl !== 'string') return next(new HttpError(400, 'No sourceTarballUrl provided'));

    if (!req.body.data || typeof req.body.data !== 'object') return next(new HttpError(400, 'No data provided'));

    checkData(req.body.data);

    debug('provision: received from appstore %j', req.body);

    next(new HttpSuccess(202, { }));
}

function retire(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (!req.body.data || typeof req.body.data !== 'object') return next(new HttpError(400, 'No data provided'));

    if (typeof req.body.data.tlsCert !== 'string') console.error('No TLS cert provided');
    if (typeof req.body.data.tlsKey !== 'string') console.error('No TLS key provided');

    debug('retire: received from appstore %j', req.body);

    installer.retire(req.body, function (error) {
        if (error) console.error(error);
    });

    next(new HttpSuccess(202, {}));
}

function logs(req, res, next) {
    if (!req.query.filename) return next(new HttpError(400, 'No filename provided'));
    var tail = req.query.tail === 'true';
    var stream = null;

    var stat = safe.fs.statSync(req.query.filename);

    if (!stat) return res.status(404).send('Not found');

    if (tail) {
        var tailStreamOptions = {
            beginAt: 'end',
            onMove: 'follow',
            detectTruncate: true,
            onTruncate: 'end',
            endOnError: true
        };

        stream = safe(function () { return ts.createReadStream(req.query.filename, tailStreamOptions); });
        stream.destroy = stream.end; // tail-stream closes it's watchers with this special API
    } else {
        stream = fs.createReadStream(req.query.filename);
        res.set('content-length', stat.size);
    }

    if (!stream) return res.status(404).send(safe.error.message);

    stream.on('error', function (error) { res.write(error.message); res.end(); });
    res.on('close', function () { stream.destroy(); });
    res.status(200);
    stream.pipe(res);
}

function backup(req, res, next) {
    // !! below port has to be in sync with box/config.js internalPort
    superagent.post('http://127.0.0.1:3001/api/v1/backup').end(function (error, result) {
        if (error) return next(new HttpError(500, error));
        if (result.statusCode !== 202) return next(new HttpError(500, 'trigger backup failed with ' + result.statusCode));
        next(new HttpSuccess(202, {}));
    });
}

function startUpdateServer(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Starting update server');

    var app = express();

    var router = new express.Router();

    if (process.env.NODE_ENV !== 'test') app.use(morgan('dev', { immediate: false }));

    app.use(json({ strict: true }))
       .use(router)
       .use(lastMile());

    router.post('/api/v1/installer/update', provision);

    gHttpServer = http.createServer(app);
    gHttpServer.on('error', console.error);

    gHttpServer.listen(2020, '127.0.0.1', callback);
}

function startProvisionServer(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Starting provision server');

    var app = express();

    var router = new express.Router();

    if (process.env.NODE_ENV !== 'test') app.use(morgan('dev', { immediate: false }));

    app.use(json({ strict: true }))
       .use(router)
       .use(lastMile());

    router.post('/api/v1/installer/retire', retire);
    router.get ('/api/v1/installer/logs', logs);
    router.post('/api/v1/installer/backup', backup);

    var caPath = path.join(__dirname, process.env.NODE_ENV === 'test' ? '../../keys/installer_ca' : 'certs');
    var certPath = path.join(__dirname, process.env.NODE_ENV === 'test' ? '../../keys/installer' : 'certs');

    var options = {
        key: fs.readFileSync(path.join(certPath, 'server.key')),
        cert: fs.readFileSync(path.join(certPath, 'server.crt')),
        ca: fs.readFileSync(path.join(caPath, 'ca.crt')),

        // request cert from client and only allow from our CA
        requestCert: true,
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' // this is set in the tests
    };

    gHttpsServer = https.createServer(options, app);
    gHttpsServer.on('error', console.error);

    gHttpsServer.listen(process.env.NODE_ENV === 'test' ? 4443 : 886, '0.0.0.0', callback);
}

function stopProvisionServer(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Stopping provision server');

    if (!gHttpsServer) return callback(null);

    gHttpsServer.close(callback);
    gHttpsServer = null;
}

function stopUpdateServer(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Stopping update server');

    if (!gHttpServer) return callback(null);

    gHttpServer.close(callback);
    gHttpServer = null;
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('starting');

    superagent.get('http://169.254.169.254/metadata/v1.json').end(function (error, result) {
        if (error || result.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return;
        }

        var userData = JSON.parse(result.body.user_data);
        var apiServerOrigin = userData.apiServerOrigin;
        debug('Using apiServerOrigin from metadata: %s', apiServerOrigin);

        async.series([
            startUpdateServer,
            startProvisionServer,
            installer.provision.bind(null, userData)
        ], callback);
    });
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    async.series([
        stopUpdateServer,
        stopProvisionServer
    ], callback);
}

if (require.main === module) {
    start(function (error) {
        if (error) console.error(error);
    });
}
