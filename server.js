#!/usr/bin/env node

'use strict';

var optimist = require('optimist'),
    Server = require('./api/server.js'),
    path = require('path');

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var baseDir = path.join(getUserHomeDir(), '.yellowtent');

var argv = optimist.usage('Usage: $0 --dataRoot <directory>')
    .alias('c', 'configRoot')
    .default('c', path.join(baseDir, 'config'))
    .describe('c', 'Server config root directory for storing user db and meta data.')
    .string('c')

    .alias('d', 'dataRoot')
    .default('d', path.join(baseDir, 'data'))
    .describe('d', 'Volume data storage directory.')
    .string('d')

    .alias('h', 'help')
    .describe('h', 'Show this help.')

    .alias('m', 'mountRoot')
    .default('m', path.join(baseDir, 'mount'))
    .describe('m', 'Volume mount point directory.')
    .string('m')

    .alias('p', 'port')
    .describe('p', 'Server port')

    .alias('s', 'silent')
    .default('s', false)
    .describe('s', 'Suppress console output for non errors.')
    .boolean('s')

    .argv;

// print help and die if requested
if (argv.h) {
    optimist.showHelp();
    process.exit(0);
}

// main entry point when running standalone
// TODO Maybe this should go into a new 'executeable' file - Johannes
var config = {
    port: argv.p || 3000,
    dataRoot: path.resolve(argv.d),
    configRoot: path.resolve(argv.c),
    mountRoot: path.resolve(argv.m),
    silent: argv.s
};

var server = new Server(config);
server.start(function (err) {
    if (err) {
        console.error('Error starting server', err);
        process.exit(1);
    }
});
