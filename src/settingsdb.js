/* jslint node:true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror');

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

    database.query('SELECT * FROM settings WHERE name = ?', [ key ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0].value);
    });
}

function getAll(callback) {
    database.query('SELECT * FROM settings', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function set(key, value, callback) {
    assert(typeof key === 'string');
    assert(value === null || typeof value === 'string');
    assert(typeof callback === 'function');

    database.query('INSERT INTO settings (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)', [ key, value ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error)); // don't rely on affectedRows here since it gives 2

        callback(null);
    });
}

function getNakedDomain(callback) {
    return get(exports.NAKED_DOMAIN_KEY, callback);
}

function setNakedDomain(appid, callback) {
    return set(exports.NAKED_DOMAIN_KEY, appid, callback);
}

