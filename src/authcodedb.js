/* jslint node:true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:authcodedb');

exports = module.exports = {
    get: get,
    add: add,
    del: del,

    _clear: clear
};

var AUTHCODES_FIELDS = [ 'authCode', 'userId', 'clientId', 'expiresAt' ].join(',');

function get(authCode, callback) {
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    database.query('SELECT ' + AUTHCODES_FIELDS + ' FROM authcodes WHERE authCode = ?', [ authCode ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function add(authCode, clientId, userId, expiresAt, callback) {
    assert(typeof authCode === 'string');
    assert(typeof clientId === 'string');
    assert(typeof userId === 'string');
    assert(typeof expiresAt === 'number');
    assert(typeof callback === 'function');

    database.query('INSERT INTO authcodes (authCode, clientId, userId, expiresAt) VALUES (?, ?, ?, ?)',
            [ authCode, clientId, userId, expiresAt ], function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(authCode, callback) {
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    database.query('DELETE FROM authcodes WHERE authCode = ?', [ authCode ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    database.query('DELETE FROM authcodes', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

