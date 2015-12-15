'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    restartAppTask: restartAppTask
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    cloudron = require('./cloudron.js'),
    debug = require('debug')('box:taskmanager'),
    locker = require('./locker.js'),
    _ = require('underscore');

var gActiveTasks = { };
var gPendingTasks = [ ];

var TASK_CONCURRENCY = 5;
var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    locker.on('unlocked', startNextTask);

    if (cloudron.isConfiguredSync()) {
        resumeTasks();
    } else {
        cloudron.events.on(cloudron.EVENT_CONFIGURED, resumeTasks);
    }

    callback();
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    gPendingTasks = [ ]; // clear this first, otherwise stopAppTask will resume them

    cloudron.events.removeListener(cloudron.EVENT_CONFIGURED, resumeTasks);
    locker.removeListener('unlocked', startNextTask);

    async.eachSeries(Object.keys(gActiveTasks), stopAppTask, callback);
}


// resume app installs and uninstalls
function resumeTasks(callback) {
    callback = callback || NOOP_CALLBACK;

    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        apps.forEach(function (app) {
            if (app.installationState === appdb.ISTATE_INSTALLED && app.runState === appdb.RSTATE_RUNNING) return;

            debug('Creating process for %s (%s) with state %s', app.location, app.id, app.installationState);
            startAppTask(app.id);
        });

        callback(null);
    });
}

function startNextTask() {
    if (gPendingTasks.length === 0) return;

    assert(Object.keys(gActiveTasks).length < TASK_CONCURRENCY);

    startAppTask(gPendingTasks.shift());
}

function startAppTask(appId) {
    assert.strictEqual(typeof appId, 'string');
    assert(!(appId in gActiveTasks));

    if (Object.keys(gActiveTasks).length >= TASK_CONCURRENCY) {
        debug('Reached concurrency limit, queueing task for %s', appId);
        gPendingTasks.push(appId);
        return;
    }

    var lockError = locker.recursiveLock(locker.OP_APPTASK);

    if (lockError) {
        debug('Locked for another operation, queueing task for %s', appId);
        gPendingTasks.push(appId);
        return;
    }

    gActiveTasks[appId] = child_process.fork(__dirname + '/apptask.js', [ appId ]);

    var pid = gActiveTasks[appId].pid;
    debug('Started task of %s pid: %s', appId, pid);

    gActiveTasks[appId].once('exit', function (code, signal) {
        debug('Task for %s pid %s completed with status %s', appId, pid, code);
        if (code === null /* signal */ || (code !== 0 && code !== 50)) { // apptask crashed
            debug('Apptask crashed with code %s and signal %s', code, signal);
            appdb.update(appId, { installationState: appdb.ISTATE_ERROR, installationProgress: 'Apptask crashed with code ' + code + ' and signal ' + signal }, NOOP_CALLBACK);
        }
        delete gActiveTasks[appId];
        locker.unlock(locker.OP_APPTASK); // unlock event will trigger next task
    });
}

function stopAppTask(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (gActiveTasks[appId]) {
        debug('stopAppTask : Killing existing task of %s with pid %s', appId, gActiveTasks[appId].pid);
        gActiveTasks[appId].once('exit', function () { callback(); });
        gActiveTasks[appId].kill(); // this will end up calling the 'exit' handler
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
