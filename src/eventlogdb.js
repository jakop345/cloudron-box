'use strict';

exports = module.exports = {
    get: get,
    getAllPaged: getAllPaged,
    add: add,
    count: count,

    _clear: clear
};

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    safe = require('safetydance');

var EVENTLOGS_FIELDS = [ 'id', 'action', 'dataJson', 'creationTime' ].join(',');

function postProcess(eventLog) {
    eventLog.data = safe.JSON.parse(eventLog.dataJson);

    delete eventLog.dataJson;

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

function getAllPaged(page, perPage, callback) {
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + EVENTLOGS_FIELDS + 'FROM eventlog ORDER BY creationTime DESC LIMIT ?,?', [ (page-1)*perPage, perPage ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results.forEach(postProcess);

        callback(null, results);
    });
}

function add(id, action, data, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof action, 'string');
    assert.strictEqual(typeof data, 'object');
    assert.strictEqual(typeof callback, 'function');

    database.query('INSERT INTO eventlog (id, action, dataJson) VALUES (?, ?, ?)', [ id, action, JSON.stringify(data) ], function (error, result) {
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
