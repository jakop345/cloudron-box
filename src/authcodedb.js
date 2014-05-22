/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('server:authcodedb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    add: add,
    del: del
};

function init(_db) {
    assert(typeof _db === 'object');

    db = _db;
}

function get(authCode, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM authcodes WHERE authCode = ?', [ authCode ], function (error, result) {
        if (error) return callback(new DatabaseError(error.message, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function add(authCode, clientId, redirectURI, userId, callback) {
    assert(db !== null);
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

    db.run('INSERT INTO authcodes (authCode, clientId, redirectURI, userId) ' +
           ' VALUES ($authCode, $clientId, $redirectURI, $userId)', data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(error.code, DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(error.message, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function del(authCode, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM authcodes WHERE authCode = ?', [ authCode ], function (error) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

