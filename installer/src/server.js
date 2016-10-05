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
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    installer = require('./installer.js'),
    json = require('body-parser').json,
    lastMile = require('connect-lastmile'),
    morgan = require('morgan'),
    request = require('request'),
    superagent = require('superagent');

exports = module.exports = {
    start: start,
    stop: stop
};

var PROVISION_CONFIG_FILE = '/root/userdata.json';
var CLOUDRON_CONFIG_FILE = '/home/yellowtent/configs/cloudron.conf';

var gHttpServer = null; // update server; used for updates

function provisionLocal(callback) {
    if (!fs.existsSync(PROVISION_CONFIG_FILE)) {
        console.error('No provisioning data found at %s', PROVISION_CONFIG_FILE);
        return callback(new Error('No provisioning data found'));
    }

    var userData = require(PROVISION_CONFIG_FILE);

    installer.provision(userData, callback);
}

function provisionDigitalOcean(callback) {
    superagent.get('http://169.254.169.254/metadata/v1.json').end(function (error, result) {
        if (error || result.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return callback(new Error('Error getting metadata'));
        }

        callback(null, JSON.parse(result.body.user_data));
    });
}

function provisionEC2(callback) {
    // need to use request, since octet-stream data
    request('http://169.254.169.254/latest/user-data', { timeout: 5000 }, function (error, response, body) {
        if (error || response.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return callback(new Error('Error getting metadata'));
        }

        callback(null, JSON.parse(body));
    });
}

function provision(callback) {
    if (fs.existsSync(CLOUDRON_CONFIG_FILE)) {
        debug('provision: already provisioned');
        return callback(null); // already provisioned
    }

    async.retry({ times: 5, interval: 30000 }, function (done) {
        // try first locally then digitalocean then ec2
        provisionLocal(function (error1, userData) {
            if (!error1) return done(null, userData);

            provisionDigitalOcean(function (error2, userData) {
                if (!error2) return done(null, userData);

                provisionEC2(function (error3, userData) {
                    if (!error3) return done(null, userData);

                    console.error('Unable to get meta data: ', error1.message, error2.message, error3.message);

                    callback(new Error(error1.message + ' ' + error2.message + ' ' + error3.message));
                });
            });
        });
    }, function (error, userData) {
        if (error) return callback(error);

        // TODO can we somehow verify the data to some extent?
        installer.provision(userData, callback);
    });
}

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

function startUpdateServer(callback) {
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

function stopUpdateServer(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Stopping update server');

    if (!gHttpServer) return callback(null);

    gHttpServer.close(callback);
    gHttpServer = null;
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Starting Installer');

    var actions = [
        startUpdateServer,
        provision
    ];

    async.series(actions, callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    async.series([
        stopUpdateServer
    ], callback);
}

if (require.main === module) {
    start(function (error) {
        if (error) console.error(error);
    });
}
