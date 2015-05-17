/* jslint node: true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    hat = require('hat');

exports = module.exports = {
    generateToken: generateToken,
    get: get,
    add: add,
    del: del,
    getByIdentifier: getByIdentifier,
    delByIdentifier: delByIdentifier,
    getByIdentifierAndClientId: getByIdentifierAndClientId,
    delByIdentifierAndClientId: delByIdentifierAndClientId,
    delExpired: delExpired,

    TYPE_USER: 'user',
    TYPE_DEV: 'developer',
    TYPE_APP: 'appliation',

    PREFIX_USER: 'user-',
    PREFIX_DEV: 'dev-',
    PREFIX_APP: 'app-',

    _clear: clear
};

var TOKENS_FIELDS = [ 'accessToken', 'identifier', 'clientId', 'scope', 'expires' ].join(',');

function generateToken() {
    return hat(256);
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

function add(accessToken, identifier, clientId, expires, scope, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof identifier === 'string');
    assert(typeof clientId === 'string' || clientId === null);
    assert(typeof expires === 'number');
    assert(typeof scope === 'string');
    assert(typeof callback === 'function');

    database.query('INSERT INTO tokens (accessToken, identifier, clientId, expires, scope) VALUES (?, ?, ?, ?, ?)',
           [ accessToken, identifier, clientId, expires, scope ], function (error, result) {
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

function getByIdentifier(identifier, callback) {
    assert(typeof identifier === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE identifier = ?', [ identifier ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function delByIdentifier(identifier, callback) {
    assert(typeof identifier === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens WHERE identifier = ?', [ identifier ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function getByIdentifierAndClientId(identifier, clientId, callback) {
    assert(typeof identifier === 'string');
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + TOKENS_FIELDS + ' FROM tokens WHERE identifier=? AND clientId=?', [ identifier, clientId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, results);
    });
}

function delByIdentifierAndClientId(identifier, clientId, callback) {
    assert(typeof identifier === 'string');
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM tokens WHERE identifier = ? AND clientId = ?', [ identifier, clientId ], function (error, result) {
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

