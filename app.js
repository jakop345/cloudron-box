#!/usr/bin/env node

'use strict';

// Put express and various other middleware in production mode
if (typeof process.env.NODE_ENV === 'undefined') {
    process.env.NODE_ENV = 'production';
}

var Server = require('./src/server.js'),
    path = require('path'),
    os = require('os'),
    config = require('./config.js');

var server = new Server(config);
server.start(function (err) {
    if (err) {
        console.error('Error starting server', err);
        process.exit(1);
    }
});

var NOOP_CALLBACK = function () { };

process.on('SIGINT', function () { server.stop(NOOP_CALLBACK); });
process.on('SIGTERM', function () { server.stop(NOOP_CALLBACK); });

