'use strict';

var assert = require('assert'),
    async = require('async'),
    authcodedb = require('./authcodedb.js'),
    debug = require('debug')('box:src/janitor'),
    tokendb = require('./tokendb.js');

exports = module.exports = {
    cleanupTokens: cleanupTokens
};

function ignoreError(func) {
    return function (callback) {
        func(function (error) {
            if (error) console.error('Ignored error:', error);

            callback();
        });
    };
}

function cleanupExpiredTokens(callback) {
    assert.strictEqual(typeof callback, 'function');

    tokendb.delExpired(function (error, result) {
        if (error) return callback(error);

        debug('Cleaned up %s expired tokens.', result);

        callback(null);
    });
}

function cleanupExpiredAuthCodes(callback) {
    assert.strictEqual(typeof callback, 'function');

    authcodedb.delExpired(function (error, result) {
        if (error) return callback(error);

        debug('Cleaned up %s expired authcodes.', result);

        callback(null);
    });
}

function cleanupTokens(callback) {
    assert.strictEqual(typeof callback, 'function');

    async.series([
        ignoreError(cleanupExpiredTokens),
        ignoreError(cleanupExpiredAuthCodes)
    ], callback);
}
