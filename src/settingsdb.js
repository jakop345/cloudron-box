/* jslint node:true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:settingsdb');

exports = module.exports = {
    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain,

    // these are for internal use, exported for testing
    get: get,
    getAll: getAll,
    set: set,

    NAKED_DOMAIN_KEY: 'naked_domain'
};

function get(key, callback) {
    assert(typeof key === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT * FROM settings WHERE name = ?', [ key ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result.value);
    });
}

function getAll(callback) {
    database.all('SELECT * FROM settings', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') result = [ ];

        callback(null, result);
    });
}

function set(key, value, callback) {
    assert(typeof key === 'string');
    assert(value === null || typeof value === 'string');
    assert(typeof callback === 'function');

    // sqlite does not have upsert
    database.run('INSERT OR REPLACE INTO settings (name, value) VALUES (?, ?)', [ key, value ], function (error) {
        if (error || this.changes !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function getNakedDomain(callback) {
    return get(exports.NAKED_DOMAIN_KEY, callback);
}

function setNakedDomain(appid, callback) {
    return set(exports.NAKED_DOMAIN_KEY, appid, callback);
}

