'use strict';

var appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apphealthmonitor'),
    docker = require('./docker.js'),
    mailer = require('./mailer.js'),
    superagent = require('superagent'),
    util = require('util');

exports = module.exports = {
    start: start,
    stop: stop
};

var HEALTHCHECK_INTERVAL = 10 * 1000; // every 10 seconds. this needs to be small since the UI makes only healthy apps clickable
var UNHEALTHY_THRESHOLD = 3 * 60 * 1000; // 3 minutes
var gHealthInfo = { }; // { time, emailSent }
var gRunTimeout = null;
var gDockerEventStream = null;

function debugApp(app) {
    assert(!app || typeof app === 'object');

    var prefix = app ? app.location : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
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

        gRunTimeout = setTimeout(run, HEALTHCHECK_INTERVAL);
    });
}

function processDockerEvents() {
    docker.getEvents({ filters: JSON.stringify({ event: [ 'oom' ] }) }, function (error, stream) {
        if (error) return console.error(error);

        debug('Listening for docker events');
        gDockerEventStream = stream;

        stream.setEncoding('utf8');
        stream.on('data', function (data) {
            var ev = JSON.parse(data);
            debug('app container ' + ev.id + ' crashed');
            appdb.getByContainerId(ev.id, function (error, app) {
                var program = error || !app.appStoreId ? ev.id : app.appStoreId;
                var context = JSON.stringify(ev);
                if (app) context = context + '\n\n' + JSON.stringify(app, null, 4) + '\n';

                mailer.sendCrashNotification(program, context); // app can be null if it's an addon crash
            });
        });

        stream.on('error', function (error) {
            console.error('Error reading docker events', error);
            gDockerEventStream = null; // will reconnect in 'run'
        });

        stream.on('end', function () {
            console.error('Docke event stream ended');
            gDockerEventStream = null; // will reconnect in 'run'
            stream.end();
        });
    });
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Starting apphealthmonitor');

    if (!gDockerEventStream) processDockerEvents();

    run();

    callback();
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    clearTimeout(gRunTimeout);
    gDockerEventStream.end();

    callback();
}
