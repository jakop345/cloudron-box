'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    stopAppTask: stopAppTask,
    startAppTask: startAppTask,
    restartAppTask: restartAppTask,

    stopPendingTasks: stopPendingTasks,
    waitForPendingTasks: waitForPendingTasks
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    cloudron = require('./cloudron.js'),
    debug = require('debug')('box:taskmanager'),
    locker = require('./locker.js'),
    platform = require('./platform.js'),
    sendFailureLogs = require('./logcollector.js').sendFailureLogs,
    util = require('util'),
    _ = require('underscore');

var gActiveTasks = { };
var gPendingTasks = [ ];

var TASK_CONCURRENCY = 5;
var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    locker.on('unlocked', startNextTask);

    platform.events.on(platform.EVENT_READY, platformReady);

    callback();
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    gPendingTasks = [ ]; // clear this first, otherwise stopAppTask will resume them

    cloudron.events.removeListener(cloudron.EVENT_CONFIGURED, resumeTasks);
    platform.events.removeListener(platform.EVENT_READY, platformReady);

    locker.removeListener('unlocked', startNextTask);

    async.eachSeries(Object.keys(gActiveTasks), stopAppTask, callback);
}

function stopPendingTasks(callback) {
    assert.strictEqual(typeof callback, 'function');

    gPendingTasks = [];

    async.eachSeries(Object.keys(gActiveTasks), stopAppTask, callback);
}

function waitForPendingTasks(callback) {
    assert.strictEqual(typeof callback, 'function');

    function checkTasks() {
        if (Object.keys(gActiveTasks).length === 0 && gPendingTasks.length === 0) return callback();
        setTimeout(checkTasks, 1000);
    }

    checkTasks();
}

function platformReady() {
    if (cloudron.isConfiguredSync()) {
        resumeTasks();
    } else {
        cloudron.events.on(cloudron.EVENT_CONFIGURED, resumeTasks);
    }
}

// resume app tasks when platform is ready or after a crash
function resumeTasks(callback) {
    callback = callback || NOOP_CALLBACK;

    debug('resuming tasks');

    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        apps.forEach(function (app) {
            if (app.installationState === appdb.ISTATE_INSTALLED && app.runState === appdb.RSTATE_RUNNING) return;

            if (app.installationState === appdb.ISTATE_ERROR) return;

            debug('Creating process for %s (%s) with state %s', app.location, app.id, app.installationState);
            restartAppTask(app.id, NOOP_CALLBACK); // restart because the auto-installer could have queued up tasks already
        });

        callback(null);
    });
}

function startNextTask() {
    if (gPendingTasks.length === 0) return;

    assert(Object.keys(gActiveTasks).length < TASK_CONCURRENCY);

    startAppTask(gPendingTasks.shift(), NOOP_CALLBACK);
}

function startAppTask(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (appId in gActiveTasks) {
        return callback(new Error(util.format('Task for %s is already active', appId)));
    }

    if (!platform.isReadySync()) {
        debug('Platform not ready yet, queueing task for %s', appId);
        gPendingTasks.push(appId);
        return callback();
    }

    if (Object.keys(gActiveTasks).length >= TASK_CONCURRENCY) {
        debug('Reached concurrency limit, queueing task for %s', appId);
        gPendingTasks.push(appId);
        return callback();
    }

    var lockError = locker.recursiveLock(locker.OP_APPTASK);

    if (lockError) {
        debug('Locked for another operation, queueing task for %s', appId);
        gPendingTasks.push(appId);
        return callback();
    }

    // when parent process dies, apptask processes are killed because KillMode=control-group in systemd unit file
    gActiveTasks[appId] = child_process.fork(__dirname + '/apptask.js', [ appId ]);

    var pid = gActiveTasks[appId].pid;
    debug('Started task of %s pid: %s', appId, pid);

    gActiveTasks[appId].once('exit', function (code, signal) {
        debug('Task for %s pid %s completed with status %s', appId, pid, code);
        if (code === null /* signal */ || (code !== 0 && code !== 50)) { // apptask crashed
            debug('Apptask crashed with code %s and signal %s', code, signal);
            sendFailureLogs('apptask', { unit: 'box' });
            appdb.update(appId, { installationState: appdb.ISTATE_ERROR, installationProgress: 'Apptask crashed with code ' + code + ' and signal ' + signal }, NOOP_CALLBACK);
        } else if (code === 50) {
            sendFailureLogs('apptask', { unit: 'box' });
        }
        delete gActiveTasks[appId];
        locker.unlock(locker.OP_APPTASK); // unlock event will trigger next task
    });

    callback();
}

function stopAppTask(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (gActiveTasks[appId]) {
        debug('stopAppTask : Killing existing task of %s with pid %s', appId, gActiveTasks[appId].pid);
        gActiveTasks[appId].once('exit', function () { callback(); });
        gActiveTasks[appId].kill('SIGTERM'); // this will end up calling the 'exit' handler
        return;
    }

    if (gPendingTasks.indexOf(appId) !== -1) {
        debug('stopAppTask: Removing pending task : %s', appId);
        gPendingTasks = _.without(gPendingTasks, appId);
    } else {
        debug('stopAppTask: no task for %s to be stopped', appId);
    }

    callback();
}

function restartAppTask(appId, callback) {
    callback = callback || NOOP_CALLBACK;

    async.series([
        stopAppTask.bind(null, appId),
        startAppTask.bind(null, appId)
    ], callback);
}
