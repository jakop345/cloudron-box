'use strict';

exports = module.exports = {
    get: get,
    getWithMembers: getWithMembers,
    getAll: getAll,
    getAllWithMembers: getAllWithMembers,
    add: add,
    update: update,
    del: del,
    count: count,

    getMembers: getMembers,
    addMember: addMember,
    removeMember: removeMember,
    setMembers: setMembers,
    isMember: isMember,

    getGroups: getGroups,
    setGroups: setGroups,

    _clear: clear,
    _addDefaultGroups: addDefaultGroups
};

var assert = require('assert'),
    constants = require('./constants.js'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror');

var GROUPS_FIELDS = [ 'id', 'name' ].join(',');

function get(groupId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + GROUPS_FIELDS + ' FROM groups WHERE id = ? ORDER BY name', [ groupId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function getWithMembers(groupId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + GROUPS_FIELDS + ',GROUP_CONCAT(groupMembers.userId) AS userIds ' +
                    ' FROM groups LEFT OUTER JOIN groupMembers ON groups.id = groupMembers.groupId ' +
                    ' WHERE groups.id = ? ' +
                    ' GROUP BY groups.id', [ groupId ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        var result = results[0];
        result.userIds = result.userIds ? result.userIds.split(',') : [ ];

        callback(null, result);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + GROUPS_FIELDS + ' FROM groups', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, result);
    });
}

function getAllWithMembers(callback) {
    database.query('SELECT ' + GROUPS_FIELDS + ',GROUP_CONCAT(groupMembers.userId) AS userIds ' +
                    ' FROM groups LEFT OUTER JOIN groupMembers ON groups.id = groupMembers.groupId ' +
                    ' GROUP BY groups.id', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (results.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        results.forEach(function (result) { result.userIds = result.userIds ? result.userIds.split(',') : [ ]; });

        callback(null, results);
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

function update(id, name, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('UPDATE groups SET name = ? WHERE id = ?', [ name, id ], function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    // also cleanup the groupMembers table
    var queries = [];
    queries.push({ query: 'DELETE FROM groupMembers WHERE groupId = ?', args: [ id ] });
    queries.push({ query: 'DELETE FROM groups WHERE id = ?', args: [ id ] });

    database.transaction(queries, function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result[1].affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

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

        database.query('DELETE FROM groups WHERE id != ?', [ 'admin' ], function (error) {
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            callback(error);
        });
    });
}

function getMembers(groupId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT userId FROM groupMembers WHERE groupId=?', [ groupId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        // if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND)); // need to differentiate group with no members and invalid groupId

        callback(error, result.map(function (r) { return r.userId; }));
    });
}

function setMembers(groupId, userIds, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert(Array.isArray(userIds));
    assert.strictEqual(typeof callback, 'function');

    var queries = [];
    queries.push({ query: 'DELETE FROM groupMembers WHERE groupId = ?', args: [ groupId ] });
    for (var i = 0; i < userIds.length; i++) {
        queries.push({ query: 'INSERT INTO groupMembers (groupId, userId) VALUES (?, ?)', args: [ groupId, userIds[i] ] });
    }

    database.transaction(queries, function (error) {
        if (error && error.code === 'ER_NO_REFERENCED_ROW_2') return callback(new DatabaseError(DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(error);
    });
}

function getGroups(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT groupId FROM groupMembers WHERE userId=? ORDER BY groupId', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        // if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND)); // need to differentiate group with no members and invalid groupId

        callback(error, result.map(function (r) { return r.groupId; }));
    });
}

function setGroups(userId, groupIds, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert(Array.isArray(groupIds));
    assert.strictEqual(typeof callback, 'function');

    var queries = [ ];
    queries.push({ query: 'DELETE from groupMembers WHERE userId = ?', args: [ userId ] });
    groupIds.forEach(function (gid) {
        queries.push({ query: 'INSERT INTO groupMembers (groupId, userId) VALUES (? , ?)', args: [ gid, userId ] });
    });

    database.transaction(queries, function (error) {
        if (error && error.code === 'ER_NO_REFERENCED_ROW_2') return callback(new DatabaseError(DatabaseError.NOT_FOUND, error.message));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
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

function isMember(groupId, userId, callback) {
    assert.strictEqual(typeof groupId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT 1 FROM groupMembers WHERE groupId=? AND userId=?', [ groupId, userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, result.length !== 0);
    });
}

function addDefaultGroups(callback) {
    add(constants.ADMIN_GROUP_ID, 'admin', callback);
}
