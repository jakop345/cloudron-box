'use strict';

var DatabaseError = require('./databaseerror'),
    path = require('path'),
    debug = require('debug')('box:clientdb'),
    database = require('./database.js'),
    assert = require('assert');

exports = module.exports = {
    get: get,
    getByClientId: getByClientId,
    add: add,
    del: del
};

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT * FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getByClientId(clientId, callback) {
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT * FROM clients WHERE clientId = ? LIMIT 1', [ clientId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null, result);
    });
}

function add(id, clientId, clientSecret, name, redirectURI, callback) {
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

    database.run('INSERT INTO clients (id, clientId, clientSecret, name, redirectURI) '
           + 'VALUES ($id, $clientId, $clientSecret, $name, $redirectURI)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM clients WHERE id = ?', [ id ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}
