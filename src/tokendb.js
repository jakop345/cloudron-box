/* jslint node: true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:tokendb'),
    uuid = require('node-uuid');

exports = module.exports = {
    generateToken: generateToken,
    get: get,
    add: add,
    del: del,
    clear: clear,
    getByUserId: getByUserId,
    delByUserId: delByUserId,
    getByUserIdAndClientId: getByUserIdAndClientId,
    delByUserIdAndClientId: delByUserIdAndClientId
};

var TOKENS_FIELDS = [ 'accessToken', 'userId', 'clientId', 'scope', 'expires' ].join(',');

function generateToken() {
    return uuid.v4();
}

function get(accessToken, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE accessToken = ?', [ accessToken ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function add(accessToken, userId, clientId, expires, scope, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string' || clientId === null);
    assert(typeof expires === 'string');
    assert(typeof scope === 'string');
    assert(typeof callback === 'function');

    database.run('INSERT INTO tokens (accessToken, userId, clientId, expires, scope) VALUES (?, ?, ?, ?, ?)',
           [ accessToken, userId, clientId, expires, scope ], function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(accessToken, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM tokens WHERE accessToken = ?', [ accessToken ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(error);
    });
}

function getByUserId(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.all('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE userId = ?', [ userId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        callback(null, results);
    });
}

function delByUserId(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM tokens WHERE userId = ?', [ userId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function getByUserIdAndClientId(userId, clientId, callback) {
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.all('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE userId=? AND clientId=?', [ userId, clientId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        callback(null, results);
    });
}

function delByUserIdAndClientId(userId, clientId, callback) {
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM tokens WHERE userId = ? AND clientId = ?', [ userId, clientId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    database.run('DELETE FROM tokens', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

