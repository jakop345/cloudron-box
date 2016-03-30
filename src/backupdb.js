/* jslint node:true */

'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    safe = require('safetydance'),
    util = require('util');

var BACKUPS_FIELDS = [ 'filename', 'creationTime', 'version', 'type', 'dependsOn', 'state', 'configJson' ];

exports = module.exports = {
    add: add,
    getPaged: getPaged,
    get: get,
    del: del,
    getByAppIdPaged: getByAppIdPaged,

    _clear: clear,

    BACKUP_TYPE_APP: 'app',
    BACKUP_TYPE_BOX: 'box',

    BACKUP_STATE_NORMAL: 'normal', // should rename to created to avoid listing in UI?
};

function postProcess(result) {
    assert.strictEqual(typeof result, 'object');

    result.dependsOn = result.dependsOn ? result.dependsOn.split(',') : [ ];
    result.config = safe.JSON.parse(result.configJson);
    delete result.configJson;
}

function getPaged(page, perPage, callback) {
    assert(typeof page === 'number' && page > 0);
    assert(typeof perPage === 'number' && perPage > 0);
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + BACKUPS_FIELDS + ' FROM backups WHERE type = ? AND state = ? ORDER BY creationTime DESC LIMIT ?,?',
        [ exports.BACKUP_TYPE_BOX, exports.BACKUP_STATE_NORMAL, (page-1)*perPage, perPage ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results.forEach(function (result) { postProcess(result); });

        callback(null, results);
    });
}

function getByAppIdPaged(page, perPage, appId, callback) {
    assert(typeof page === 'number' && page > 0);
    assert(typeof perPage === 'number' && perPage > 0);
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + BACKUPS_FIELDS + ' FROM backups WHERE type = ? AND state = ? AND filename LIKE ? ORDER BY creationTime DESC LIMIT ?,?',
        [ exports.BACKUP_TYPE_APP, exports.BACKUP_STATE_NORMAL, 'appbackup\\_' + appId + '\\_%', (page-1)*perPage, perPage ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results.forEach(function (result) { postProcess(result); });

        callback(null, results);
    });
}

function get(filename, callback) {
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + BACKUPS_FIELDS + ' FROM backups WHERE filename = ? AND type = ? AND state = ? ORDER BY creationTime DESC',
        [ filename, exports.BACKUP_TYPE_BOX, exports.BACKUP_STATE_NORMAL ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result[0]);

        callback(null, result[0]);
    });
}

function add(backup, callback) {
    assert(backup && typeof backup === 'object');
    assert.strictEqual(typeof backup.filename, 'string');
    assert.strictEqual(typeof backup.version, 'string');
    assert(backup.type === exports.BACKUP_TYPE_APP || backup.type === exports.BACKUP_TYPE_BOX);
    assert(util.isArray(backup.dependsOn));
    assert(backup.config && typeof backup.config === 'object');
    assert.strictEqual(typeof callback, 'function');

    var creationTime = backup.creationTime || new Date(); // allow tests to set the time

    database.query('INSERT INTO backups (filename, version, type, creationTime, state, dependsOn, configJson) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ backup.filename, backup.version, backup.type, creationTime, exports.BACKUP_STATE_NORMAL, backup.dependsOn.join(','), JSON.stringify(backup.configJson) ],
        function (error) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function clear(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('TRUNCATE TABLE backups', [], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        callback(null);
    });
}

function del(filename, callback) {
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM backups WHERE filename=?', [ filename ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        callback(null);
    });
}
