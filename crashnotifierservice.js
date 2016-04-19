#!/usr/bin/env node

'use strict';

var sendCrashNotification = require('./src/crashnotifier').sendCrashNotification;

function main() {
    if (process.argv.length !== 3) return console.error('Usage: crashnotifier.js <processName>');

    var processName = process.argv[2];
    console.log('Started crash notifier for', processName);

    sendCrashNotification(processName);
}

main();
