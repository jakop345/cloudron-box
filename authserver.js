#!/usr/bin/env node

'use strict';

var app = require('commander'),
    path = require('path'),
    Server = require('./auth/server');

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var port = process.env.PORT || 4000;
var configDir = process.env.CONFIG_DIR || path.join(getUserHomeDir(), '.yellowtent');

app.version('0.1.0')
    .usage('[options]')
    .option('-p --port [port]', 'The port to listen on. [' + port + ']', port)
    .option('-c --config-directory [host]', 'The main configuration directory. [' + configDir + ']', configDir)
    .option('--silent', 'Toggle logging [false]', false)
    .parse(process.argv);

if (app.silent) {
    console.log = function () {};
}

console.log();
console.log('==========================================');
console.log('Authserver will use the following settings');
console.log('==========================================');
console.log();
console.log(' Port:                    ', parseInt(app.port, 10));
console.log(' Configuration Directory: ', app.configDir);
console.log();
console.log('==========================================');
console.log();

var server = new Server(parseInt(app.port, 10),
    app.configDir,
    app.silent
);

server.start(function (error) {
    if (error) {
        console.log('Unable to start server.', error);
        process.exit(2);
    }

    console.log('Server up and running on port %d.', port);
});
