'use strict';

exports = module.exports = {
    get: get,
    getAllPaged: getAllPaged,
    add: add,
    count: count,
    delByCreationTime: delByCreationTime,

    _clear: clear
};

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    mysql = require('mysql'),
    safe = require('safetydance'),
    util = require('util');

var EVENTLOGS_FIELDS = [ 'id', 'action', 'source', 'data', 'creationTime' ].join(',');

// until mysql module supports automatic type coercion
function postProcess(eventLog) {
    eventLog.source = safe.JSON.parse(eventLog.source);
    eventLog.data = safe.JSON.parse(eventLog.data);
    return eventLog;
}

function get(eventId, callback) {
    assert.strictEqual(typeof eventId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + EVENTLOGS_FIELDS + ' FROM eventlog WHERE id = ?', [ eventId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, postProcess(result[0]));
    });
}

function getAllPaged(action, search, page, perPage, callback) {
    assert(typeof action === 'string' || action === null);
    assert(typeof search === 'string' || search === null);
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    var data = [];
    var query = 'SELECT ' + EVENTLOGS_FIELDS + ' FROM eventlog';

    if (action || search) query += ' WHERE';
    if (search) query += ' data LIKE ' + mysql.escape('%' + search + '%');
    if (action && search) query += ' AND ';

    if (action) {
        query += ' action=?';
        data.push(action);
    }

    query += ' ORDER BY creationTime DESC LIMIT ?,?';

    data.push((page-1)*perPage);
    data.push(perPage);

    database.query(query, data, function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results.forEach(postProcess);

        callback(null, results);
    });
}

function add(id, action, source, data, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof action, 'string');
    assert.strictEqual(typeof source, 'object');
    assert.strictEqual(typeof data, 'object');
    assert.strictEqual(typeof callback, 'function');

    database.query('INSERT INTO eventlog (id, action, source, data) VALUES (?, ?, ?, ?)', [ id, action, JSON.stringify(source), JSON.stringify(data) ], function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function count(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT COUNT(*) AS total FROM eventlog', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null, result[0].total);
    });
}

function clear(callback) {
    database.query('DELETE FROM eventlog', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(error);
    });
}

function delByCreationTime(creationTime, actions, callback) {
    assert(util.isDate(creationTime));
    assert(Array.isArray(actions));
    assert.strictEqual(typeof callback, 'function');

    var query = 'DELETE FROM eventlog WHERE creationTime < ? ';
    if (actions.length) query += ' AND ( ' + actions.map(function () { return 'action != ?'; }).join(' AND ') + ' ) ';

    database.query(query, [ creationTime ].concat(actions), function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(error);
    });
}
