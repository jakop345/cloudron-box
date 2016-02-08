'use strict';

exports = module.exports = {
    get: get,
    add: add,
    del: del,
    count: count,

    _clear: clear
};

var assert = require('assert'),
    database = require('./database.js'),
    debug = require('debug')('box:groupdb'),
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
    database.query('DELETE FROM groups', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(error);
    });
}

