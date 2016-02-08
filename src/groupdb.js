'use strict';

exports = module.exports = {
    get: get,
    add: add,
    del: del,
    count: count,

    getMembers: getMembers,
    addMember: addMember,
    removeMember: removeMember,

    _clear: clear
};

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror');

var GROUPS_FIELDS = [ 'id', 'name' ].join(',');

function get(groupId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + GROUPS_FIELDS + ' FROM groups WHERE id = ?', [ groupId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function add(id, name, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    var data = [ id, name ];
    database.query('INSERT INTO groups (id, name) VALUES (?, ?)',
           data, function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM groups WHERE id = ?', [ id ], function (error, result) {
        if (error && error.code === 'ER_ROW_IS_REFERENCED_2') return callback(new DatabaseError(DatabaseError.IN_USE));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(error);
    });
}

function count(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT COUNT(*) AS total FROM groups', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null, result[0].total);
    });
}

function clear(callback) {
    database.query('DELETE FROM groupMembers', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        database.query('DELETE FROM groups', function (error) {
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            callback(error);
        });
    });
}

function getMembers(groupId, callback) {
    database.query('SELECT userId FROM groupMembers WHERE groupId=?', [ groupId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        // if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND)); // need to differentiate group with no members and invalid groupId

        callback(error, result.map(function (r) { return r.userId; }));
    });
}

function addMember(groupId, userId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('INSERT INTO groupMembers (groupId, userId) VALUES (?, ?)', [ groupId, userId ], function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error && error.code === 'ER_NO_REFERENCED_ROW_2') return callback(new DatabaseError(DatabaseError.NOT_FOUND));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function removeMember(groupId, userId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM groupMembers WHERE groupId = ? AND userId = ?', [ groupId, userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}
