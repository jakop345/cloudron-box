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
    superagent = require('superagent'),
    util = require('util');

exports = module.exports = {
    run: run
};

var HEALTHCHECK_INTERVAL = 60 * 1000; // every minute
var UNHEALTHY_THRESHOLD = 3 * 60 * 1000; // 3 minutes
var gHealthInfo = { }; // { time, emailSent }

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? app.location : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    async.series([
        database.initialize,
        mailer.initialize
    ], callback);
}

function setHealth(app, health, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof health, 'string');
    assert.strictEqual(typeof callback, 'function');

    var now = new Date();

    if (!(app.id in gHealthInfo)) { // add new apps to list
        gHealthInfo[app.id] = { time: now, emailSent: false };
    }

    if (health === appdb.HEALTH_HEALTHY) {
        gHealthInfo[app.id].time = now;
    } else if (Math.abs(now - gHealthInfo[app.id].time) > UNHEALTHY_THRESHOLD) {
        if (gHealthInfo[app.id].emailSent) return callback(null);

        debugApp(app, 'marking as unhealthy since not seen for more than %s minutes', UNHEALTHY_THRESHOLD/(60 * 1000));

        mailer.appDied(app);
        gHealthInfo[app.id].emailSent = true;
    } else {
        debugApp(app, 'waiting for sometime to update the app health');
        return callback(null);
    }

    appdb.setHealth(app.id, health, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null); // app uninstalled?
        if (error) return callback(error);

        app.health = health;

        callback(null);
    });
}


// callback is called with error for fatal errors and not if health check failed
function checkAppHealth(app, callback) {
    if (app.installationState !== appdb.ISTATE_INSTALLED || app.runState !== appdb.RSTATE_RUNNING) {
        debugApp(app, 'skipped. istate:%s rstate:%s', app.installationState, app.runState);
        return callback(null);
    }

    var container = docker.getContainer(app.containerId),
        manifest = app.manifest;

    container.inspect(function (err, data) {
        if (err || !data || !data.State) {
            debugApp(app, 'Error inspecting container');
            return setHealth(app, appdb.HEALTH_ERROR, callback);
        }

        if (data.State.Running !== true) {
            debugApp(app, 'exited');
            return setHealth(app, appdb.HEALTH_DEAD, callback);
        }

        // poll through docker network instead of nginx to bypass any potential oauth proxy
        var healthCheckUrl = 'http://127.0.0.1:' + app.httpPort + manifest.healthCheckPath;
        superagent
            .get(healthCheckUrl)
            .redirects(0)
            .timeout(HEALTHCHECK_INTERVAL)
            .end(function (error, res) {

            if (error || res.status >= 400) { // 2xx and 3xx are ok
                debugApp(app, 'not alive : %s', error || res.status);
                setHealth(app, appdb.HEALTH_UNHEALTHY, callback);
            } else {
                debugApp(app, 'alive');
                setHealth(app, appdb.HEALTH_HEALTHY, callback);
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

