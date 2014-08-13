/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror'),
    database = require('./database.js'),
    debug = require('debug')('box:authcodedb'),
    assert = require('assert');

exports = module.exports = {
    get: get,
    add: add,
    del: del
};

function get(authCode, callback) {
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT * FROM authcodes WHERE authCode = ?', [ authCode ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function add(authCode, clientId, redirectURI, userId, callback) {
    assert(typeof authCode === 'string');
    assert(typeof clientId === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    var data = {
        $authCode: authCode,
        $clientId: clientId,
        $redirectURI: redirectURI,
        $userId: userId
    };

    database.run('INSERT INTO authcodes (authCode, clientId, redirectURI, userId) ' +
           ' VALUES ($authCode, $clientId, $redirectURI, $userId)', data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
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

