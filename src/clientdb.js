/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:clientdb'),
    database = require('./database.js'),
    assert = require('assert');

exports = module.exports = {
    get: get,
    getByClientId: getByClientId,
    add: add,
    del: del,
    getByAppId: getByAppId,
    delByAppId: delByAppId,
    getActiveClientsByUserId: getActiveClientsByUserId
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

function getByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT * FROM clients WHERE appId = ? LIMIT 1', [ appId ], function (error, result) {
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

function getActiveClientsByUserId(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.all('SELECT tokens.accessToken,tokens.clientId,clients.name,scope,COUNT(*) AS tokens FROM tokens,clients WHERE tokens.clientId=clients.id AND userId=? GROUP BY tokens.clientId', [ userId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof results === 'undefined') results = [];

        callback(null, results);
    });
}