#!/usr/bin/env node

'use strict';

require('supererror')({ splatchError: true });

var tokendb = require('./src/tokendb.js'),
    assert = require('assert'),
    debug = require('debug')('box:janitor'),
    async = require('async'),
    database = require('./src/database.js');

exports = module.exports = {
    run: run
};

var TOKEN_CLEANUP_INTERVAL = 30000;

function initialize(callback) {
    assert(typeof callback === 'function');

    async.series([
        database.initialize
    ], callback);
}

function cleanupExpiredTokens(callback) {
    assert(typeof callback === 'function');

    tokendb.delExpired(function (error, result) {
        if (error) return callback(error);

        debug('Cleaned up %s expired tokens.', result);
        callback(null);
    });
}

function run() {
    cleanupExpiredTokens(function (error) {
        if (error) console.error(error);

        setTimeout(run, TOKEN_CLEANUP_INTERVAL);
    });
}

if (require.main === module) {
    initialize(function (error) {
        if (error) {
            console.error('janitor task exiting with error', error);
            process.exit(1);
        }

        run();
    });
}

