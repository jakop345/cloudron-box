/* jslint node:true */

'use strict';

exports = module.exports = {
    get: get,
    getAll: getAll,
    getAllWithTokenCountByIdentifier: getAllWithTokenCountByIdentifier,
    add: add,
    del: del,
    getByAppId: getByAppId,
    delByAppId: delByAppId,

    _clear: clear
};

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js');

var CLIENTS_FIELDS = [ 'id', 'appId', 'clientSecret', 'redirectURI', 'scope' ].join(',');
var CLIENTS_FIELDS_PREFIXED = [ 'clients.id', 'clients.appId', 'clients.clientSecret', 'clients.redirectURI', 'clients.scope' ].join(',');

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + CLIENTS_FIELDS + ' FROM clients ORDER BY appId', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function getAllWithTokenCountByIdentifier(identifier, callback) {
    assert.strictEqual(typeof identifier, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + CLIENTS_FIELDS_PREFIXED + ',COUNT(tokens.clientId) AS tokenCount FROM clients LEFT OUTER JOIN tokens ON clients.id=tokens.clientId WHERE tokens.identifier=? GROUP BY clients.id', [ identifier ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        callback(null, results);

    });
}

function getByAppId(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + CLIENTS_FIELDS + ' FROM clients WHERE appId = ? LIMIT 1', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null, result[0]);
    });
}

function add(id, appId, clientSecret, redirectURI, scope, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof clientSecret, 'string');
    assert.strictEqual(typeof redirectURI, 'string');
    assert.strictEqual(typeof scope, 'string');
    assert.strictEqual(typeof callback, 'function');

    var data = [ id, appId, clientSecret, redirectURI, scope ];

    database.query('INSERT INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (?, ?, ?, ?, ?)', data, function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error || result.affectedRows === 0) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM clients WHERE id = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function delByAppId(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM clients WHERE appId=?', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function clear(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM clients WHERE appId!="webadmin"', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

