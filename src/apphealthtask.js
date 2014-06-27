/* jslint node:true */

'use strict';

var assert = require('assert'),
    config = require('../config.js'),
    database = require('./database.js'),
    appdb = require('./appdb.js'),
    async = require('async'),
    Docker = require('dockerode'),
    superagent = require('superagent'),
    os = require('os'),
    debug = require('debug')('box:apphealthtask');

exports = module.exports = {
    initialize: initialize,
    run: run
};

var FATAL_CALLBACK = function (error) {
    if (!error) return;
    console.error(error);
    process.exit(2);
};

var HEALTHCHECK_INTERVAL = 5000;
var docker = null;

function initialize() {
    if (os.platform() === 'linux') {
        docker = new Docker({socketPath: '/var/run/docker.sock'});
    } else {
        docker = new Docker({ host: 'http://localhost', port: 2375 });
    }

    database.initialize(config, function (error) {
        if (error) throw error;
    });
}

function updateApp(app, values, callback) {
    for (var value in values) {
        app[value] = values[value];
    }
    appdb.update(app.id, values, callback);
 }

// # TODO should probably poll from the outside network instead of the docker network?
function checkAppHealth(app, callback) {
    var container = docker.getContainer(app.containerId),
        manifest = JSON.parse(app.manifestJson); // this is guaranteed not to throw since it's already been verified in downloadManifest()

    container.inspect(function (err, data) {
        if (err || !data || !data.State) {
            debug('Error inspecting container');
            updateApp(app, { statusCode: appdb.STATUS_IMAGE_ERROR, statusMessage: 'Error inspecting image' }, FATAL_CALLBACK);
            return callback(err);
        }

        if (data.State.Running !== true) {
            debug(app.id + ' has exited');
            updateApp(app, { statusCode: appdb.STATUS_EXITED, statusMessage: 'Not running' }, FATAL_CALLBACK);
            return callback(null);
        }

        var healthCheckUrl = 'http://127.0.0.1:' + app.httpPort + manifest.health_check_url;
        superagent
            .get(healthCheckUrl)
            .timeout(HEALTHCHECK_INTERVAL)
            .end(function (error, res) {

            if (error || res.status !== 200) {
                debug('Marking application as dead: ' + app.id);
                updateApp(app, { statusCode: appdb.STATUS_NOT_RESPONDING, statusMessage: 'Health check failed' }, FATAL_CALLBACK);
                callback(null);
            } else {
                debug('healthy app:' + app.id);
                updateApp(app, { statusCode: appdb.STATUS_RUNNING, statusMessage: healthCheckUrl }, FATAL_CALLBACK);
                callback(null);
            }
        });
    });
}

function processApps(callback) {
    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        async.each(apps, function (app, done) {
            switch (app.statusCode) {
            case appdb.STATUS_RUNNING:
            case appdb.STATUS_NOT_RESPONDING:
            case appdb.STATUS_EXITED:
                checkAppHealth(app, done);
                break;
            default:
                done();
                break;
            }
        }, callback);
    });
}

function run(callback) {
    processApps(function (error) {
        if (error) return callback(error);
        setTimeout(run.bind(null, callback), HEALTHCHECK_INTERVAL);
    });
}

if (require.main === module) {
    initialize();

    run(function (error) {
        debug('apphealth task exiting with error:' + error);
        process.exit(error ? 1 : 0);
    });
}

