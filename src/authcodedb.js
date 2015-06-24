/* jslint node:true */

'use strict';


exports.get = get;
exports.add = add;
exports.del = del;
exports.delExpired = delExpired;

exports._clear = clear;


var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror');

var AUTHCODES_FIELDS = [ 'authCode', 'userId', 'clientId', 'expiresAt' ].join(',');

function get(authCode, callback) {
    assert.strictEqual(typeof authCode, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + AUTHCODES_FIELDS + ' FROM authcodes WHERE authCode = ? AND expiresAt > ?', [ authCode, Date.now() ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function add(authCode, clientId, userId, expiresAt, callback) {
    assert.strictEqual(typeof authCode, 'string');
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof expiresAt, 'number');
    assert.strictEqual(typeof callback, 'function');

    database.query('INSERT INTO authcodes (authCode, clientId, userId, expiresAt) VALUES (?, ?, ?, ?)',
            [ authCode, clientId, userId, expiresAt ], function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(authCode, callback) {
    assert.strictEqual(typeof authCode, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM authcodes WHERE authCode = ?', [ authCode ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function delExpired(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM authcodes WHERE expiresAt <= ?', [ Date.now() ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        return callback(null, result.affectedRows);
    });
}

function clear(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM authcodes', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

