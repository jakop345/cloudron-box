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
    docker = require('./docker.js').connection,
    _ = require('underscore');

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

var gTasks = { }; // appId -> { tasksConfig (manifest), jobs -> { containerId, cronJob } }

function sync(callback) {
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    debug('Syncing');

    apps.getAll(function (error, allApps) {
        if (error) return callback(error);

        // stop tasks of apps that went away
        var allAppIds = allApps.map(function (app) { return app.id; });
        var removedAppIds = _.difference(Object.keys(gTasks), allAppIds);
        removedAppIds.forEach(stopJobs);

        // start tasks of new apps
        allApps.forEach(function (app) { resetTasks(app.id, app.manifest.addons.scheduler || null); });
    });
}

function stopJobs(appId) {
    assert.strictEqual(typeof appId, 'string');

    debug('stopJobs for %s', appId);

    for (var job in gTasks[appId].jobs) {
        job.cronJob.stop();
    }

    delete gTasks[appId];
}

function startJobs(appId, tasksConfig) {
    gTasks[appId] = { tasksConfig: tasksConfig, jobs: { } };

    debug('startJobs for %s', appId);

    Object.keys(tasksConfig).forEach(function (taskName) {
        var task = tasksConfig[taskName];

        debug('scheduling task %s/%s @ 00 %s : %s', appId, taskName, task.schedule, task.command);

        var job = new CronJob({
            cronTime: '00 ' + task.schedule, // at this point, the pattern has been validated
            onTick: runTask.bind(null, appId, taskName, task),
            start: true
        });

        gTasks[appId].jobs[taskName] = { cronJob: job };
    });
}

function resetTasks(appId, tasksConfig) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof tasksConfig, 'object');

    // cleanup existing state
    if (appId in gTasks) {
        if (_.isEqual(gTasks[appId].tasksConfig, tasksConfig)) return; // nothing changed

        stopJobs(appId);
    }

    if (!tasksConfig) return;

    startJobs(appId, tasksConfig);
}

function runTask(appId, taskName, task, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof taskName, 'string');
    assert.strictEqual(typeof task, 'object');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    var containerId = gTasks[appId].jobs[taskName].containerId;

    if (containerId) {
        debug('task %s/%s is already running');
        async.series([
            docker.stopContainer.bind(null, containerId),
            docker.deleteContainer.bind(null, containerId)
        ], callback);
        return;
    }

    apps.get(appId, function (error, app) {
        if (error) return callback(error);

        if (app.installationState !== appdb.ISTATE_INSTALLED || app.runState !== appdb.RSTATE_RUNNING) {
            debug('task %s skipped. app %s is not installed/running', taskName, app.id);
            return callback();
        }

        debug('task %s/%s starting', app.id, taskName);

        docker.createSubcontainer(app, [ '/bin/sh', '-c', task.command ], function (error, container) {
            gTasks[appId].jobs[taskName].containerId = container.id;

            docker.startContainer(container.id, callback);
        });
    });
}
