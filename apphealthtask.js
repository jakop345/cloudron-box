#!/usr/bin/env node

'use strict';

require('supererror')({ splatchError: true });

var appdb = require('./src/appdb.js'),
    assert = require('assert'),
    async = require('async'),
    database = require('./src/database.js'),
    DatabaseError = require('./src/databaseerror.js'),
    debug = require('debug')('box:apphealthtask'),
    docker = require('./src/docker.js'),
    mailer = require('./src/mailer.js'),
    os = require('os'),
    superagent = require('superagent');

exports = module.exports = {
    initialize: initialize,
    run: run
};

var FATAL_CALLBACK = function (error) {
    if (!error) return;
    console.error(error);
    process.exit(2);
};

var HEALTHCHECK_INTERVAL = 30000;
var gLastSeen = { }; // { time, emailSent }

function initialize(callback) {
    async.series([
        database.initialize,
        mailer.initialize
    ], callback);
}

function setHealth(app, alive, runState, callback) {
    assert(typeof app === 'object');
    assert(typeof alive === 'boolean');
    assert(typeof runState === 'string');
    assert(typeof callback === 'function');

    var healthy = true; // app is unhealthy if not alive for 2 mins
    var now = new Date();

    if (alive || !(app.id in gLastSeen)) { // give never seen apps 2 mins to come up
        gLastSeen[app.id] = { time: now, emailSent: false };
    } else if (Math.abs(now - gLastSeen[app.id].time) > 120 * 1000) { // not seen for 2 mins
        debug('app %s not seen for more than 2 mins, marking as unhealthy', app.id);
        healthy = false;
    }

    if (!healthy && !gLastSeen[app.id].emailSent) {
        gLastSeen[app.id].emailSent = true;
        mailer.appDied(app);
    }

    appdb.setHealth(app.id, healthy, runState, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null); // app uninstalled?
        if (error) return callback(error);

        app.healthy = healthy;
        app.runState = runState;

        callback(null);
    });
}


// callback is called with error for fatal errors and not if health check failed
function checkAppHealth(app, callback) {
    // only check status of installed apps. we could possibly optimize more by checking runState as well
    if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(null);

    var container = docker.getContainer(app.containerId),
        manifest = app.manifest;

    container.inspect(function (err, data) {
        if (err || !data || !data.State) {
            debug('Error inspecting container');
            return setHealth(app, false, appdb.RSTATE_ERROR, callback);
        }

        if (data.State.Running !== true) {
            debug('app %s has exited', app.id);
            return setHealth(app, false, appdb.RSTATE_DEAD, callback);
        }

        // poll through docker network instead of nginx to bypass any potential oauth proxy
        var healthCheckUrl = 'http://127.0.0.1:' + app.httpPort + manifest.healthCheckPath;
        superagent
            .get(healthCheckUrl)
            .redirects(0)
            .timeout(HEALTHCHECK_INTERVAL)
            .end(function (error, res) {

            if (error || res.status >= 400) { // 2xx and 3xx are ok
                debug('app %s is not alive : %s', app.id, error || res.status);
                setHealth(app, false, appdb.RSTATE_RUNNING, callback);
            } else {
                debug('app %s is alive', app.id);
                setHealth(app, true, appdb.RSTATE_RUNNING, callback);
            }
        });
    });
}

function processApps(callback) {
    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        async.each(apps, checkAppHealth, function (error) {
            if (error) console.error(error);
            callback(null);
        });
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
        console.error('apphealth task exiting with error.', error);
        process.exit(error ? 1 : 0);
    });
}

