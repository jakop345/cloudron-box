'use strict';

var assert = require('assert'),
    CronJob = require('cron').CronJob,
    debug = require('debug')('box:cron'),
    updater = require('./updater.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize
};

var NOOP_CALLBACK = function (error) { console.error(error); };
var gUpdaterJob = null;

function initialize(callback) {
    assert(typeof callback === 'function');

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

    callback();
}

