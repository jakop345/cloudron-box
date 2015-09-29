'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    restartAppTask: restartAppTask
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    child_process = require('child_process'),
    debug = require('debug')('box:taskmanager'),
    locker = require('./locker.js'),
    _ = require('underscore');

var gActiveTasks = { };
var gPendingTasks = [ ];

var TASK_CONCURRENCY = 5;
var NOOP_CALLBACK = function (error) { console.error(error); };

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    // resume app installs and uninstalls
    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        apps.forEach(function (app) {
            if (app.installationState === appdb.ISTATE_INSTALLED && app.runState === appdb.RSTATE_RUNNING) return;

            debug('Creating process for %s (%s) with state %s', app.location, app.id, app.installationState);
            startAppTask(app.id);
        });

        callback(null);
    });

    locker.on('unlocked', startNextTask);
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    gPendingTasks = [ ]; // clear this first, otherwise stopAppTask will resume them
    for (var appId in gActiveTasks) {
        stopAppTask(appId);
    }

    locker.removeListener('unlocked', startNextTask);

    callback(null);
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
    gActiveTasks[appId].once('exit', function (code) {
        debug('Task for %s completed with status %s', appId, code);
        if (code && code !== 50) { // apptask crashed
            appdb.update(appId, { installationState: appdb.ISTATE_ERROR, installationProgress: 'Apptask crashed with code ' + code }, NOOP_CALLBACK);
        }
        delete gActiveTasks[appId];
        locker.unlock(locker.OP_APPTASK); // unlock event will trigger next task
    });
}

function stopAppTask(appId) {
    assert.strictEqual(typeof appId, 'string');

    if (gActiveTasks[appId]) {
        debug('stopAppTask : Killing existing task of %s with pid %s: ', appId, gActiveTasks[appId].pid);
        gActiveTasks[appId].kill(); // this will end up calling the 'exit' handler
        delete gActiveTasks[appId];
    } else if (gPendingTasks.indexOf(appId) !== -1) {
        debug('stopAppTask: Removing existing pending task : %s', appId);
        gPendingTasks = _.without(gPendingTasks, appId);
    }
}

function restartAppTask(appId) {
    stopAppTask(appId);
    startAppTask(appId);
}

