/* jslint node: true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:tokendb'),
    hat = require('hat');

exports = module.exports = {
    generateToken: generateToken,
    get: get,
    add: add,
    del: del,
    getByUserId: getByUserId,
    delByUserId: delByUserId,
    getByUserIdAndClientId: getByUserIdAndClientId,
    delByUserIdAndClientId: delByUserIdAndClientId,
    delExpired: delExpired,

    _clear: clear
};

var TOKENS_FIELDS = [ 'accessToken', 'userId', 'clientId', 'scope', 'expires' ].join(',');

function generateToken() {
    return hat();
}

function get(accessToken, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE accessToken = ? AND expires > ?', [ accessToken, Date.now() ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function add(accessToken, userId, clientId, expires, scope, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string' || clientId === null);
    assert(typeof expires === 'number');
    assert(typeof scope === 'string');
    assert(typeof callback === 'function');

    database.query('INSERT INTO tokens (accessToken, userId, clientId, expires, scope) VALUES (?, ?, ?, ?, ?)',
           [ accessToken, userId, clientId, expires, scope ], function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(accessToken, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens WHERE accessToken = ?', [ accessToken ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(error);
    });
}

function getByUserId(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE userId = ?', [ userId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function delByUserId(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens WHERE userId = ?', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function getByUserIdAndClientId(userId, clientId, callback) {
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE userId=? AND clientId=?', [ userId, clientId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function delByUserIdAndClientId(userId, clientId, callback) {
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens WHERE userId = ? AND clientId = ?', [ userId, clientId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function delExpired(callback) {
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens WHERE expires <= ?', [ Date.now() ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        return callback(null, result.affectedRows);
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

