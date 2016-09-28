'use strict';

exports = module.exports = {
    add: add,
    del: del,

    listAliases: listAliases,
    listMailboxes: listMailboxes,
    // listGroups: listGroups, // this is beyond my SQL skillz

    getMailbox: getMailbox,
    getGroup: getGroup,
    getAlias: getAlias,

    getAliasesForName: getAliasesForName,
    setAliasesForName: setAliasesForName,

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

    database.query('INSERT INTO mailboxes (name, ownerId, ownerType) VALUES (?, ?, ?)', [ name, ownerId, ownerType ], function (error) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, 'mailbox already exists'));
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
    database.query('DELETE FROM mailboxes WHERE ownerId=?', [ id ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function getMailbox(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE name = ? AND (ownerType = ? OR ownerType = ?) AND aliasTarget IS NULL', [ name, exports.TYPE_APP, exports.TYPE_USER ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, results[0]);
    });
}

function listMailboxes(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE (ownerType = ? OR ownerType = ?) AND aliasTarget IS NULL ORDER BY name', [ exports.TYPE_APP, exports.TYPE_USER ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function getGroup(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    // This can be merged into a single query but cannot get 'not found' information
    // SELECT users.username FROM mailboxes
    //    INNER JOIN groupMembers ON mailboxes.ownerId = groupMembers.groupId
    //    INNER JOIN users ON groupMembers.userId = users.id
    //    WHERE mailboxes.name = <name>

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE name = ? AND ownerType = ? AND aliasTarget IS NULL', [ name, exports.TYPE_GROUP ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        database.query('SELECT users.username FROM groupMembers INNER JOIN users ON groupMembers.userId = users.id WHERE groupMembers.groupId = ?', [ results[0].ownerId ], function (error, memberList) {
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            results[0].members = memberList.map(function (m) { return m.username; });

            callback(null, results[0]);
        });
    });
}

function getByOwnerId(ownerId, callback) {
    assert.strictEqual(typeof ownerId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE ownerId = ? ORDER BY name', [ ownerId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, results);
    });
}

function setAliasesForName(name, aliases, callback) {
    assert.strictEqual(typeof name, 'string');
    assert(util.isArray(aliases));
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE name = ? ', [ name ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        var queries = [];
        queries.push({ query: 'DELETE FROM mailboxes WHERE aliasTarget = ?', args: [ name ] });
        aliases.forEach(function (alias) {
            queries.push({ query: 'INSERT INTO mailboxes (name, aliasTarget, ownerId, ownerType) VALUES (?, ?, ?, ?)',
                         args: [ alias, name, results[0].ownerId, results[0].ownerType ] });
        });

        database.transaction(queries, function (error) {
            if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error.message));
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            callback(null);
        });
    });
}

function getAliasesForName(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT name FROM mailboxes WHERE aliasTarget=? ORDER BY name', [ name ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results = results.map(function (r) { return r.name; });
        callback(null, results);
    });
}

function listAliases(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE aliasTarget IS NOT NULL ORDER BY name', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function getAlias(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + MAILBOX_FIELDS + ' FROM mailboxes WHERE name = ? AND aliasTarget IS NOT null', [ name ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, results[0]);
    });
}
