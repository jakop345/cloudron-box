/* jslint node:true */

'use strict';

// this code is intentionally placed before the requires because of circular
// dependancy between database and the *db.js files
exports = module.exports = {
    init: init,
    get: get,
    getAll: getAll,
    set: set,

    NAKED_DOMAIN_KEY: 'naked_domain'
};

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:settingsdb'),
    assert = require('assert'),
    database = require('./database.js');

// database
var db = null;

function init(_db) {
    assert(typeof _db === 'object');

    db = _db;
}

function get(key, callback) {
    assert(db !== null);
    assert(typeof key === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM settings WHERE key = ?', [ key ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result.value);
    });
}

function getAll(callback) {
    assert(db !== null);

    db.all('SELECT * FROM settings', function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') result = [ ];

        callback(null, result);
    });
}

function set(key, value, callback) {
    assert(db !== null);
    assert(typeof key === 'string');
    assert(value === null || typeof value === 'string');
    assert(typeof callback === 'function');

    // sqlite does not have upsert
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [ key, value ], function (error) {
        if (error || this.changes !== 1) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

