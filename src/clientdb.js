'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    debug = require('debug')('clientdb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    getByClientId: getByClientId,
    add: add,
    del: del
};

function init(_db) {
    assert(typeof _db === 'object');

    db = _db;
}

function get(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');


    db.get('SELECT * FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getByClientId(clientId, callback) {
    assert(db !== null);
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM clients WHERE clientId = ? LIMIT 1', [ clientId ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        return callback(null, result);
    });
}

function add(id, clientId, clientSecret, name, redirectURI, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof clientId === 'string');
    assert(typeof clientSecret === 'string');
    assert(typeof name === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof callback === 'function');

    var data = {
        $id: id,
        $clientId: clientId,
        $clientSecret: clientSecret,
        $name: name,
        $redirectURI: redirectURI
    };

    db.run('INSERT INTO clients (id, clientId, clientSecret, name, redirectURI) '
           + 'VALUES ($id, $clientId, $clientSecret, $name, $redirectURI)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(error, DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function del(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM clients WHERE id = ?', [ id ], function (error) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}
