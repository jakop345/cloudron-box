'use strict';

var assert = require('assert'),
    cloudron = require('./cloudron.js'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:cron'),
    updater = require('./updater.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize
};

var NOOP_CALLBACK = function (error) { console.error(error); };
var gUpdaterJob = null,
    gHeartbeatJob = null,
    gBackupJob = null;

// cron format
// Seconds: 0-59
// Minutes: 0-59
// Hours: 0-23
// Day of Month: 1-31
// Months: 0-11
// Day of Week: 0-6

function initialize(callback) {
    assert(typeof callback === 'function');

    gHeartbeatJob = new CronJob({
        cronTime: '00 * * * * *', // every minute
        onTick: cloudron.sendHeartbeat,
        start: true
    });

    gBackupJob = new CronJob({
        cronTime: '00 00 0,4,8,12,16,20 * * *', // every 4 hours
        onTick: cloudron.backup,
        start: true
    });

    gUpdaterJob = new CronJob({
        cronTime: '00 00 1 * * *', // everyday at 1am
        onTick: function() {
            debug('Checking if update available');
            if (updater.getUpdateInfo().box) updater.update(NOOP_CALLBACK);
        },
        start: true
    });

    callback(null);
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    gUpdaterJob.stop();
    gUpdaterJob = null;

    gHeartbeatJob.stop();
    gHeartbeatJob = null;

    gBackupJob.stop();
    gBackupJob = null;

    callback();
}

