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
    paths = require('./paths.js'),
    safe = require('safetydance'),
    _ = require('underscore');

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

// appId -> { tasksConfig (manifest), jobs -> { containerId, cronJob } }
function loadState() {
    var tasks = safe.JSON.parse(safe.fs.readFileSync(paths.SCHEDULER_FILE, 'utf8'));
    return tasks || { };
}

function saveState(tasks) {
    safe.fs.writeFileSync(paths.SCHEDULER_FILE, JSON.stringify(tasks, null, 4), 'utf8');
}

function sync(callback) {
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    debug('Syncing');

    var state = loadState();

    apps.getAll(function (error, allApps) {
        if (error) return callback(error);

        // stop tasks of apps that went away
        var allAppIds = allApps.map(function (app) { return app.id; });
        var removedAppIds = _.difference(Object.keys(state), allAppIds);
        async.eachSeries(removedAppIds, function (appId, iteratorDone) {
            stopJobs(appId, state[appId], iteratorDone);
        }, function (error) {
            if (error) debug('Error stopping jobs : %j', error);

            state = _.omit(state, removedAppIds);

            // start tasks of new apps
            allApps.forEach(function (app) {
                state[app.id] = resetAppState(app.id, state[app.id] || null, app.manifest.addons.scheduler || null);
            });

            saveState(state);

            debug('Done syncing');
        });
    });
}

function stopJobs(appId, appState, callback) {
    assert.strictEqual(typeof appId, 'string');

    debug('stopJobs for %s', appId);

    async.eachSeries(Object.keys(appState.jobs), function (taskName, iteratorDone) {
        appState.jobs[taskName].cronJob.stop();
        killTask(appState.jobs[taskName].containerId, iteratorDone);
    }, callback);
}

function createCronJobs(appId, tasksConfig) {
    debug('creating cron jobs for %s', appId);

    var jobs = { };

    Object.keys(tasksConfig).forEach(function (taskName) {
        var task = tasksConfig[taskName];

        debug('scheduling task %s/%s @ 00 %s : %s', appId, taskName, task.schedule, task.command);

        var cronJob = new CronJob({
            cronTime: '00 ' + task.schedule, // at this point, the pattern has been validated
            onTick: doTask.bind(null, appId, taskName),
            start: true
        });

        jobs[taskName] = { cronJob: cronJob, containerId: null };
    });

    return jobs;
}

function resetAppState(appId, appState, tasksConfig) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof appState, 'object');
    assert.strictEqual(typeof tasksConfig, 'object');

    if (appState) { 
        // cleanup existing state
        if (_.isEqual(appState.tasksConfig, tasksConfig)) return; // nothing changed

        stopJobs(appId, appState); // something changed, stop all the existing jobs
    }

    if (!tasksConfig) return null;

    return {
        tasksConfig: tasksConfig,
        jobs: createCronJobs(appId, tasksConfig)
    };
}

function killTask(containerId, callback) {
    if (!containerId) return callback();

    async.series([
        docker.stopContainer.bind(null, containerId),
        docker.deleteContainer.bind(null, containerId)
    ], callback);
}

function doTask(appId, taskName, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof taskName, 'string');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    var state = loadState();
    var job = state[appId].jobs[taskName];

    if (job.containerId) {
        debug('task %s/%s is already running. killing it');
        return killTask(job.containerId, callback);
    }

    apps.get(appId, function (error, app) {
        if (error) return callback(error);

        if (app.installationState !== appdb.ISTATE_INSTALLED || app.runState !== appdb.RSTATE_RUNNING) {
            debug('task %s skipped. app %s is not installed/running', taskName, app.id);
            return callback();
        }

        debug('task %s/%s starting', app.id, taskName);

        docker.createSubcontainer(app, [ '/bin/sh', '-c', state[appId].tasksConfig[taskName].command ], function (error, container) {
            job.containerId = container.id;

            saveState(state);

            docker.startContainer(container.id, callback);
        });
    });
}
