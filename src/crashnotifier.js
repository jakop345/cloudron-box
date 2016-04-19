'use strict';

exports = module.exports = {
    sendCrashNotification: sendCrashNotification
};

var assert = require('assert'),
    mailer = require('./mailer.js'),
    safe = require('safetydance'),
    path = require('path'),
    util = require('util');

var COLLECT_LOGS_CMD = path.join(__dirname, 'scripts/collectlogs.sh');

function collectLogs(program, callback) {
    assert.strictEqual(typeof program, 'string');
    assert.strictEqual(typeof callback, 'function');

    var logs = safe.child_process.execSync('sudo ' + COLLECT_LOGS_CMD + ' ' + program, { encoding: 'utf8' });
    callback(null, logs);
}

function sendCrashNotification(processName) {
    collectLogs(processName, function (error, result) {
        if (error) {
            console.error('Failed to collect logs.', error);
            result = util.format('Failed to collect logs.', error);
        }

        console.log('Sending crash notification email for', processName);
        mailer.sendCrashNotification(processName, result);
    });
}
