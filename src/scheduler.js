'use strict';

exports = module.exports = {
    sync: sync
};

var appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    config = require('./config.js'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:src/scheduler'),
    docker = require('./docker.js'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    _ = require('underscore');

var NOOP_CALLBACK = function (error) { if (error) debug('Unhandled error: ', error); };

// appId -> { schedulerConfig (manifest), cronjobs }
var gState = (function loadState() {
    var state = safe.JSON.parse(safe.fs.readFileSync(paths.SCHEDULER_FILE, 'utf8'));
    return state || { };
})();

function saveState(state) {
    // do not save cronJobs
    var safeState = { };
    for (var appId in state) {
        safeState[appId] = {
            schedulerConfig: state[appId].schedulerConfig
        };
    }
    safe.fs.writeFileSync(paths.SCHEDULER_FILE, JSON.stringify(safeState, null, 4), 'utf8');
}

function sync(callback) {
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    debug('Syncing');

    apps.getAll(function (error, allApps) {
        if (error) return callback(error);

        // stop tasks of apps that went away
        var allAppIds = allApps.map(function (app) { return app.id; });
        var removedAppIds = _.difference(Object.keys(gState), allAppIds);
        async.eachSeries(removedAppIds, function (appId, iteratorDone) {
            stopJobs(appId, gState[appId], true /* killContainers */, iteratorDone);
        }, function (error) {
            if (error) debug('Error stopping jobs : %j', error);

            gState = _.omit(gState, removedAppIds);

            // start tasks of new apps
            async.eachSeries(allApps, function (app, iteratorDone) {
                var appState = gState[app.id] || null;
                var schedulerConfig = app.manifest.addons.scheduler || null;

                if (!appState && !schedulerConfig) return iteratorDone(); // nothing changed

                if (appState && _.isEqual(appState.schedulerConfig, schedulerConfig) && appState.cronJobs) {
                    return iteratorDone(); // nothing changed
                }

                var killContainers = appState && !appState.cronJobs ? true : false; // keep the old containers on 'startup'
                stopJobs(app.id, appState, killContainers, function (error) {
                    if (error) debug('Error stopping jobs for %s : %s', app.id, error.message);

                    if (!schedulerConfig) {
                        delete gState[app.id];
                        return iteratorDone();
                    }

                    gState[app.id] = {
                        schedulerConfig: schedulerConfig,
                        cronJobs: createCronJobs(app.id, schedulerConfig)
                    };

                    saveState(gState);

                    iteratorDone();
                });
            });

            debug('Done syncing');
        });
    });
}

function killContainer(containerName, callback) {
    if (!containerName) return callback();

    async.series([
        docker.stopContainerByName.bind(null, containerName),
        docker.deleteContainerByName.bind(null, containerName)
    ], function (error) {
        if (error) debug('Failed to kill task with name %s : %s', containerName, error.message);

        callback(error);
    });
}

function stopJobs(appId, appState, killContainers, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof appState, 'object');
    assert.strictEqual(typeof killContainers, 'boolean');
    assert.strictEqual(typeof callback, 'function');

    debug('stopJobs for %s', appId);

    if (!appState) return callback();

    async.eachSeries(Object.keys(appState.schedulerConfig), function (taskName, iteratorDone) {
        if (appState.cronJobs && appState.cronJobs[taskName]) {  // could be null across restarts
            appState.cronJobs[taskName].stop();
        }

        if (!killContainers) return iteratorDone();

        var containerName = appId + '-' + taskName;
        killContainer(containerName, iteratorDone);
    }, callback);
}

function createCronJobs(appId, schedulerConfig) {
    assert.strictEqual(typeof appId, 'string');
    assert(schedulerConfig && typeof schedulerConfig === 'object');

    debug('creating cron jobs for app %s', appId);

    var jobs = { };

    Object.keys(schedulerConfig).forEach(function (taskName) {
        var task = schedulerConfig[taskName];

        var cronTime = (config.TEST ? '*/5 ' : '00 ') + task.schedule; // time ticks faster in tests

        debug('scheduling task for %s/%s @ %s : %s', appId, taskName, cronTime, task.command);

        var cronJob = new CronJob({
            cronTime: cronTime, // at this point, the pattern has been validated
            onTick: doTask.bind(null, appId, taskName),
            start: true
        });

        jobs[taskName] = cronJob;
    });

    return jobs;
}

function doTask(appId, taskName, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof taskName, 'string');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    debug('Executing task %s/%s', appId, taskName);

    apps.get(appId, function (error, app) {
        if (error) return callback(error);

        if (app.installationState !== appdb.ISTATE_INSTALLED || app.runState !== appdb.RSTATE_RUNNING) {
            debug('task %s skipped. app %s is not installed/running', taskName, app.id);
            return callback();
        }

        var containerName = app.id + '-' + taskName;

        killContainer(containerName, function (error) {
            if (error) return callback(error);

            debug('Creating subcontainer for %s/%s : %s', app.id, taskName, gState[appId].schedulerConfig[taskName].command);

            // NOTE: if you change container name here, fix addons.js to return correct container names
            docker.createSubcontainer(app, containerName, [ '/bin/sh', '-c', gState[appId].schedulerConfig[taskName].command ], { } /* options */, function (error, container) {
                if (error) return callback(error);

                saveState(gState);

                docker.startContainer(container.id, callback);
            });
        });
    });
}
