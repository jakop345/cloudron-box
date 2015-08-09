#!/usr/bin/env node

'use strict';

// WARNING This is a supervisor eventlistener!
//         The communication happens via stdin/stdout
//         !! No console.log() allowed
//         !! Do not set DEBUG

var assert = require('assert'),
    mailer = require('./src/mailer.js'),
    safe = require('safetydance'),
    supervisor = require('supervisord-eventlistener'),
    path = require('path'),
    util = require('util');

var gLastNotifyTime = {};
var gCooldownTime = 1000 * 60  * 5; // 5 min
var COLLECT_LOGS_CMD = path.join(__dirname, 'src/scripts/collectlogs.sh');

function collectLogs(program, callback) {
    assert.strictEqual(typeof program, 'string');
    assert.strictEqual(typeof callback, 'function');

    var logs = safe.child_process.execSync('sudo ' + COLLECT_LOGS_CMD + ' ' + program, { encoding: 'utf8' });
    callback(null, logs);
}

supervisor.on('PROCESS_STATE_EXITED', function (headers, data) {
    if (data.expected === '1') return console.error('Normal app %s exit', data.processname);

    console.error('%s exited unexpectedly', data.processname);

    collectLogs(data.processname, function (error, result) {
        if (error) {
            console.error('Failed to collect logs.', error);
            result = util.format('Failed to collect logs.', error);
        }

        if (!gLastNotifyTime[data.processname] || gLastNotifyTime[data.processname] < Date.now() - gCooldownTime) {
            console.error('Send mail.');
            mailer.sendCrashNotification(data.processname, result);
            gLastNotifyTime[data.processname] = Date.now();
        } else {
            console.error('Do not send mail, already sent one recently.');
        }
    });
});

mailer.initialize(function () {
    supervisor.listen(process.stdin, process.stdout);
    console.error('Crashnotifier listening...');
});
