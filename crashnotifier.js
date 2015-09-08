#!/usr/bin/env node

'use strict';

var assert = require('assert'),
    mailer = require('./src/mailer.js'),
    safe = require('safetydance'),
    path = require('path'),
    util = require('util');

var COLLECT_LOGS_CMD = path.join(__dirname, 'src/scripts/collectlogs.sh');

function collectLogs(program, callback) {
    assert.strictEqual(typeof program, 'string');
    assert.strictEqual(typeof callback, 'function');

    var logs = safe.child_process.execSync('sudo ' + COLLECT_LOGS_CMD + ' ' + program, { encoding: 'utf8' });
    callback(null, logs);
}

function sendCrashNotification(processName) {
    console.error('%s exited unexpectedly', processName);

    collectLogs(processName, function (error, result) {
        if (error) {
            console.error('Failed to collect logs.', error);
            result = util.format('Failed to collect logs.', error);
        }

        mailer.sendCrashNotification(processName, result);
    });
}

function main() {
    if (process.argv.length !== 3) return console.error('Usage: crashnotifier.js <processName>');

    mailer.initialize(function () {
        sendCrashNotification(process.argv[2]);
    });
}

main();
