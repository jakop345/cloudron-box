'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    uuid = require('node-uuid'),
    debug = require('debug')('tokendb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    generateToken: generateToken,
    get: get,
    getByUserId: getByUserId,
    add: add,
    del: del,
    delByUserId: delByUserId
};

function init(_db) {
    assert(typeof _db === 'object');
    db = _db;
}

function generateToken() {
    return uuid.v4();
}

function get(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM tokens WHERE accessToken = ?', [ accessToken ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function add(accessToken, userId, clientId, expires, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string' || clientId === null);
    assert(typeof expires === 'string');
    assert(typeof callback === 'function');

    var data = {
        $accessToken: accessToken,
        $userId: userId,
        $clientId: clientId,
        $expires: expires
    };

    db.run('INSERT INTO tokens (accessToken, userId, clientId, expires) '
           + 'VALUES ($accessToken, $userId, $clientId, $expires)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(error, DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function del(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM tokens WHERE accessToken = ?', [ accessToken ], function (error) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(error);
    });
}

function getByUserId(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM tokens WHERE userId = ? LIMIT 1', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        return callback(null, result);
    });
}

function delByUserId(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM tokens WHERE userId = ?', [ userId ], function (error, result) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        return callback(null, result);
    });
}
