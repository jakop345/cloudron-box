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
        async.eachSeries(removedAppIds, stopJobs, function (error) {
            if (error) debug('Error stopping jobs : %j', error);

            // start tasks of new apps
            allApps.forEach(function (app) {
                resetTasks(app.id, app.manifest.addons.scheduler || null);
            });

            debug('Done syncing');
        });
    });
}

function stopJobs(appId, callback) {
    assert.strictEqual(typeof appId, 'string');

    debug('stopJobs for %s', appId);

    async.eachSeries(Object.keys(gTasks[appId].jobs), function (taskName, iteratorDone) {
        gTasks[appId].jobs[taskName].cronJob.stop();
        killTask(appId, taskName, iteratorDone);
    }, function (error) {
        if (error) return callback(error);

        delete gTasks[appId];

        callback();
    });
}

function createCronJobs(appId, tasksConfig) {
    gTasks[appId] = { tasksConfig: tasksConfig, jobs: { } };

    debug('creating cron jobs for %s', appId);

    Object.keys(tasksConfig).forEach(function (taskName) {
        var task = tasksConfig[taskName];

        debug('scheduling task %s/%s @ 00 %s : %s', appId, taskName, task.schedule, task.command);

        var job = new CronJob({
            cronTime: '00 ' + task.schedule, // at this point, the pattern has been validated
            onTick: doTask.bind(null, appId, taskName, task),
            start: true
        });

        gTasks[appId].jobs[taskName] = { cronJob: job };
    });
}

function resetTasks(appId, tasksConfig) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof tasksConfig, 'object'); // can be null

    // cleanup existing state
    if (appId in gTasks) {
        if (_.isEqual(gTasks[appId].tasksConfig, tasksConfig)) return; // nothing changed

        stopJobs(appId); // something changes, stop all the existing jobs
    }

    if (!tasksConfig) return;

    createCronJobs(appId, tasksConfig);
}

function killTask(appId, taskName, callback) {
    var containerId = gTasks[appId].jobs[taskName].containerId;

    if (!containerId) return callback();

    async.series([
        docker.stopContainer.bind(null, containerId),
        docker.deleteContainer.bind(null, containerId)
    ], callback);
}

function doTask(appId, taskName, task, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof taskName, 'string');
    assert.strictEqual(typeof task, 'object');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    var containerId = gTasks[appId].jobs[taskName].containerId;

    if (containerId) {
        debug('task %s/%s is already running. killing it');
        return killTask(appId, taskName, callback);
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
