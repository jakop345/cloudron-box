'use strict';

exports = module.exports = {
    add: add,
    del: del,
    upsertByOwner: upsertByOwner,
    get: get,
    getAliases: getAliases,
    setAliases: setAliases,
    getByOwnerId: getByOwnerId,
    delByOwnerId: delByOwnerId,

    _clear: clear,

    TYPE_USER: 'user',
    TYPE_APP: 'app',
    TYPE_GROUP: 'group'
};

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    util = require('util');

var MAILBOX_FIELDS = [ 'name', 'ownerId', 'ownerType', 'aliasTarget', 'creationTime' ].join(',');

function add(name, ownerId, ownerType, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof ownerId, 'string');
    assert.strictEqual(typeof ownerType, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('INSERT INTO mailboxes (name, ownerId, ownerType) VALUES (?, ?, ?)', [ name, ownerId, ownerType, name ], function (error) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function upsertByOwner(ownerId, ownerType, name, callback) {
    assert.strictEqual(typeof ownerId, 'string');
    assert.strictEqual(typeof ownerType, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('INSERT INTO mailboxes (name, ownerId, ownerType) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=?', [ name, ownerId, ownerType, name ], function (error) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function clear(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('TRUNCATE TABLE mailboxes', [], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        callback(null);
    });
}

function del(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    // deletes aliases as well
    database.query('DELETE FROM mailboxes WHERE name=? OR aliasTarget = ?', [ name, name ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function delByOwnerId(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    // deletes aliases as well
    database.query('DELETE FROM mailboxes WHERE ownerId=?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function get(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE name = ? ', [ name ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, results[0]);
    });
}

function getByOwnerId(ownerId, callback) {
    assert.strictEqual(typeof ownerId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE ownerId = ? ', [ ownerId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, results[0]);
    });
}

function setAliases(name, aliases, ownerId, ownerType, callback) {
    assert.strictEqual(typeof name, 'string');
    assert(util.isArray(aliases));
    assert.strictEqual(typeof ownerId, 'string');
    assert.strictEqual(typeof ownerType, 'string');
    assert.strictEqual(typeof callback, 'function');

    // also cleanup the groupMembers table
    var queries = [];
    queries.push({ query: 'DELETE FROM mailboxes WHERE aliasTarget = ?', args: [ name ] });
    aliases.forEach(function (alias) {
        queries.push({ query: 'INSERT INTO mailboxes (name, aliasTarget, ownerId, ownerType) VALUES (?, ?, ?, ?)', args: [ alias, name, ownerId, ownerType ] });
    });

    database.transaction(queries, function (error) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error.message));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function getAliases(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT name FROM mailboxes WHERE aliasTarget=? ORDER BY name', [ name ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results = results.map(function (r) { return r.name; });
        callback(null, results);
    });
}
