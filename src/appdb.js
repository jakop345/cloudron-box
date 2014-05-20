'use strict';

var DatabaseError = require('./databaseerror'),
    path = require('path'),
    debug = require('debug')('appdb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    add: add,
    del: del,
    update: update,
    getAll: getAll
};

function init(_db) {
    assert(typeof _db === 'object');

    db = _db;
}

function get(appId, callback) {
    assert(db !== null);
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM apps WHERE appId = ?', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getAll(callback) {
    assert(db !== null);

    db.all('SELECT * FROM apps', function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') result = [ ];

        callback(null, result);
    });
}

function add(id, status, config, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof status === 'string');
    assert(typeof config === 'string' || config === null);
    assert(typeof callback === 'function');

    var data = {
        $id: id,
        $status: app.status,
        $config: $app.config
    };

    db.run('INSERT INTO apps (id, status, config) '
           + 'VALUES ($id, $status, $config)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(error, DatabaseError.ALREADY_EXISTS));

        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function del(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM apps WHERE id = ?', [ id ], function (error) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function update(id, app, status, config, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof status === 'string');
    assert(typeof config === 'string' || config === null);
    assert(typeof callback === 'function');

    db.run('UPDATE apps SET status = ?, config = ?config WHERE id = ?', [ status, config, id ], function (error) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

