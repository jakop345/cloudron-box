/* jslint node:true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
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

    database.initialize(function (error) {
        if (error) throw error;
    });
}

// # TODO should probably poll from the outside network instead of the docker network?
// callback is called with error for fatal errors and not if health check failed
function checkAppHealth(app, callback) {
    if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(null);

    var container = docker.getContainer(app.containerId),
        manifest = app.manifest;

    function setHealth(app, healthy, runState, callback) {
        app.healthy = healthy;
        app.runState = runState;

        appdb.setHealth(app.id, healthy, runState, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) { // app got uninstalled
                return callback(null);
            }

            callback(error);
        });
     }

    container.inspect(function (err, data) {
        if (err || !data || !data.State) {
            debug('Error inspecting container');
            return setHealth(app, false, appdb.RSTATE_ERROR, callback);
        }

        if (data.State.Running !== true) {
            debug(app.id + ' has exited');
            return setHealth(app, false, appdb.RSTATE_STOPPED, callback);
        }

        var healthCheckUrl = 'http://127.0.0.1:' + app.httpPort + manifest.healthCheckPath;
        superagent
            .get(healthCheckUrl)
            .timeout(HEALTHCHECK_INTERVAL)
            .end(function (error, res) {

            if (error || res.status !== 200) {
                debug('Marking application as dead: ' + app.id);
                setHealth(app, false, appdb.RSTATE_RUNNING, callback);
            } else {
                debug('healthy app:' + app.id);
                setHealth(app, true, appdb.RSTATE_RUNNING, callback);
            }
        });
    });
}

function processApps(callback) {
    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        async.each(apps, checkAppHealth, callback);
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

