'use strict';

exports = module.exports = {
    sendFailureLogs: sendFailureLogs
};

var assert = require('assert'),
    mailer = require('./mailer.js'),
    safe = require('safetydance'),
    path = require('path'),
    util = require('util');

var COLLECT_LOGS_CMD = path.join(__dirname, 'scripts/collectlogs.sh');

function collectLogs(unitName, callback) {
    assert.strictEqual(typeof unitName, 'string');
    assert.strictEqual(typeof callback, 'function');

    var logs = safe.child_process.execSync('sudo ' + COLLECT_LOGS_CMD + ' ' + unitName, { encoding: 'utf8' });
    callback(null, logs);
}

function sendFailureLogs(processName, options) {
    assert.strictEqual(typeof processName, 'string');
    assert.strictEqual(typeof options, 'object');

    collectLogs(options.unit || processName, function (error, result) {
        if (error) {
            console.error('Failed to collect logs.', error);
            result = util.format('Failed to collect logs.', error);
        }

        console.log('Sending failure logs for', processName);

        mailer.unexpectedExit(processName, result);
    });
}
