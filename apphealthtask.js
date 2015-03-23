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
    run: run
};

var HEALTHCHECK_INTERVAL = 2 * 60 * 1000; // every 2 mins
var gLastSeen = { }; // { time, emailSent }

function initialize(callback) {
    assert(typeof callback === 'function');

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

    var healthy = true;
    var now = new Date();

    if (alive || !(app.id in gLastSeen)) { // add new apps to list
        gLastSeen[app.id] = { time: now, emailSent: false };
    } else if (Math.abs(now - gLastSeen[app.id].time) > HEALTHCHECK_INTERVAL * 5) { // not seen for 5 intervals
        debug('app %s not seen for more than %s secs, marking as unhealthy', app.id, HEALTHCHECK_INTERVAL/1000 * 5);
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

function run() {
    processApps(function (error) {
        if (error) console.error(error);

        setTimeout(run, HEALTHCHECK_INTERVAL);
    });
}

if (require.main === module) {
    initialize(function (error) {
        if (error) {
            console.error('apphealth task exiting with error', error);
            process.exit(1);
        }

        run();
    });
}

