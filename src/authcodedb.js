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
    clear: clear
};

var AUTHCODES_FIELDS = [ 'authCode', 'userId', 'clientId' ].join(',');

function get(authCode, callback) {
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + AUTHCODES_FIELDS + ' FROM authcodes WHERE authCode = ?', [ authCode ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function add(authCode, clientId, userId, callback) {
    assert(typeof authCode === 'string');
    assert(typeof clientId === 'string');
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.run('INSERT INTO authcodes (authCode, clientId, userId) VALUES (?, ?, ?)',
            [ authCode, clientId, userId ], function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(authCode, callback) {
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM authcodes WHERE authCode = ?', [ authCode ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    database.run('DELETE FROM authcodes', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

