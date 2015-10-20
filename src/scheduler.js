'use strict';

exports = module.exports = {
    sync: sync
};

var appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:src/scheduler'),
    docker = require('./docker.js'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    _ = require('underscore');

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

// appId -> { schedulerConfig (manifest), cronjobs, containerIds }
var gState = null; // null indicates that we will load state on first sync

function loadState() {
    var state = safe.JSON.parse(safe.fs.readFileSync(paths.SCHEDULER_FILE, 'utf8'));
    return state || { };
}

function saveState(state) {
    safe.fs.writeFileSync(paths.SCHEDULER_FILE, JSON.stringify(_.omit(state, 'cronJobs'), null, 4), 'utf8');
}

function sync(callback) {
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    debug('Syncing');

    if (gState === null) gState = loadState();

    apps.getAll(function (error, allApps) {
        if (error) return callback(error);

        // stop tasks of apps that went away
        var allAppIds = allApps.map(function (app) { return app.id; });
        var removedAppIds = _.difference(Object.keys(gState), allAppIds);
        async.eachSeries(removedAppIds, function (appId, iteratorDone) {
            stopJobs(appId, gState[appId], iteratorDone);
        }, function (error) {
            if (error) debug('Error stopping jobs : %j', error);

            gState = _.omit(gState, removedAppIds);

            // start tasks of new apps
            async.eachSeries(allApps, function (app, iteratorDone) {
                var appState = gState[app.id] || null;
                var schedulerConfig = app.manifest.addons.scheduler || null;

                if (!appState && !schedulerConfig) return iteratorDone(); // nothing changed
                if (appState && _.isEqual(appState.schedulerConfig, schedulerConfig)) return iteratorDone(); // nothing changed

                stopJobs(app.id, appState, function (error) {
                    if (error) debug('Error stopping jobs for %s : %s', app.id, error.message);

                    if (!schedulerConfig) {
                        delete gState[app.id];
                        return iteratorDone();
                    }

                    gState[app.id] = {
                        schedulerConfig: schedulerConfig,
                        cronJobs: createCronJobs(app.id, schedulerConfig),
                        containerIds: { }
                    };

                    saveState(gState);

                    iteratorDone();
                });
            });

            debug('Done syncing');
        });
    });
}

function killTask(containerId, callback) {
    if (!containerId) return callback();

    async.series([
        docker.stopContainer.bind(null, containerId),
        docker.deleteContainer.bind(null, containerId)
    ], function (error) {
        if (error) debug('Failed to kill task with containerId %s : %s', containerId, error.message);

        callback(error);
    });
}

function stopJobs(appId, appState, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof appState, 'object');

    debug('stopJobs for %s', appId);

    if (!appState) return callback();

    async.eachSeries(Object.keys(appState.schedulerConfig), function (taskName, iteratorDone) {
        if (appState.cronJobs[taskName]) appState.cronJobs[taskName].stop(); // could be null across restarts

        killTask(appState.containerIds[taskName], iteratorDone);
    }, callback);
}

function createCronJobs(appId, schedulerConfig) {
    debug('creating cron jobs for app %s', appId);

    if (!schedulerConfig) return null;

    var jobs = { };

    Object.keys(schedulerConfig).forEach(function (taskName) {
        var task = schedulerConfig[taskName];

        debug('scheduling task for %s/%s @ 00 %s : %s', appId, taskName, task.schedule, task.command);

        var cronJob = new CronJob({
            cronTime: '00 ' + task.schedule, // at this point, the pattern has been validated
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

    var appState = gState[appId];

    apps.get(appId, function (error, app) {
        if (error) return callback(error);

        if (app.installationState !== appdb.ISTATE_INSTALLED || app.runState !== appdb.RSTATE_RUNNING) {
            debug('task %s skipped. app %s is not installed/running', taskName, app.id);
            return callback();
        }

        if (appState.containerIds[taskName]) debug('task %s/%s is already running. killing it');

        killTask(appState.containerIds[taskName], function (error) {
            if (error) return callback(error);

            debug('task %s/%s starting', app.id, taskName);

            docker.createSubcontainer(app, [ '/bin/sh', '-c', gState[appId].schedulerConfig[taskName].command ], function (error, container) {
                appState.containerIds[taskName] = container.id;

                saveState(gState);

                docker.startContainer(container.id, callback);
            });
        });
    });
}
