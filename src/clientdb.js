/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:clientdb'),
    database = require('./database.js'),
    assert = require('assert');

exports = module.exports = {
    get: get,
    getAll: getAll,
    getAllWithDetails: getAllWithDetails,
    getByClientId: getByClientId,
    add: add,
    del: del,
    getByAppId: getByAppId,
    delByAppId: delByAppId
};

var CLIENTS_FIELDS = [ 'id', 'appId', 'clientId', 'clientSecret', 'name', 'redirectURI' ].join(',');
var CLIENTS_FIELDS_PREFIXED = [ 'clients.id', 'clients.appId', 'clients.clientId', 'clients.clientSecret', 'clients.name', 'clients.redirectURI' ].join(',');

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    database.all('SELECT ' + CLIENTS_FIELDS + ' FROM clients', [ ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        callback(null, results);
    });
}

function getAllWithDetails(callback) {
    assert(typeof callback === 'function');

    // TODO should this be per user?
    database.all('SELECT ' + CLIENTS_FIELDS_PREFIXED + ',tokens.scope,COUNT(tokens.clientId) AS tokenCount FROM clients LEFT OUTER JOIN tokens ON clients.id=tokens.clientId GROUP BY clients.id', [], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        callback(null, results);
    });
}

function getByClientId(clientId, callback) {
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE clientId = ? LIMIT 1', [ clientId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null, result);
    });
}

function getByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE appId = ? LIMIT 1', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null, result);
    });
}

function add(id, appId, clientId, clientSecret, name, redirectURI, callback) {
    assert(typeof id === 'string');
    assert(typeof appId === 'string');
    assert(typeof clientId === 'string');
    assert(typeof clientSecret === 'string');
    assert(typeof name === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof callback === 'function');

    var data = {
        $id: id,
        $appId: appId,
        $clientId: clientId,
        $clientSecret: clientSecret,
        $name: name,
        $redirectURI: redirectURI
    };

    database.run('INSERT INTO clients (id, appId, clientId, clientSecret, name, redirectURI) VALUES ($id, $appId, $clientId, $clientSecret, $name, $redirectURI)', data, function (error) {
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

function delByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM clients WHERE appId=?', [ appId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}
