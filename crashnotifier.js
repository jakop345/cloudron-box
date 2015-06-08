#!/usr/bin/env node

'use strict';

// WARNING This is a supervisor eventlistener!
//         The communication happens via stdin/stdout
//         !! No console.log() allowed
//         !! Do not set DEBUG

var supervisor = require('supervisord-eventlistener'),
    mailer = require('./src/mailer.js');

supervisor.on('PROCESS_STATE_EXITED', function (headers, data) {
    if (data.expected === '1') return console.error('Normal app %s exit', data.processname);

    console.error('%s exited unexpectedly, send mail', data.processname);

    mailer.sendCrashNotification(data.processname, '');
});

mailer.initialize(function () {
    supervisor.listen(process.stdin, process.stdout);
    console.error('Crashnotifier listening...');
});