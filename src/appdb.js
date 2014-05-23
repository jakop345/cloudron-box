/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('server:appdb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    add: add,
    del: del,
    update: update,
    getAll: getAll,

    // status codes
    STATUS_PENDING_INSTALL: 'pending_install',
    STATUS_PENDING_UNINSTALL: 'pending_uninstall',
    STATUS_INSTALLED: 'installed',
    STATUS_DOWNLOADING_MANIFEST: 'downloading_manifest',
    STATUS_DOWNLOADED_MANIFEST: 'downloaded_manifest',
    STATUS_DOWNLOADING_IMAGE: 'downloading_image',
    STATUS_DOWNLOADED_IMAGE: 'downloaded_image',
    STATUS_MANIFEST_ERROR: 'manifest_error',
    STATUS_DOWNLOAD_ERROR: 'download_error',
    STATUS_IMAGE_ERROR: 'image_error',
    STATUS_STARTING_UP: 'starting_up',
    STATUS_STARTED: 'started',
    STATUS_RUNNING: 'running',
    STATUS_EXITED: 'exited'
};

function init(_db) {
    assert(typeof _db === 'object');

    db = _db;
}

function get(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM apps WHERE id = ?', [ id ], function (error, result) {
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

function add(id, statusCode, config, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof statusCode === 'string');
    assert(typeof config === 'string' || config === null);
    assert(typeof callback === 'function');

    var data = {
        $id: id,
        $statusCode: statusCode,
        $config: config
    };

    db.run('INSERT INTO apps (id, statusCode, config) VALUES ($id, $statusCode, $config)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(error, DatabaseError.ALREADY_EXISTS));

        if (error || !this.lastID) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function del(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM apps WHERE id = ?', [ id ], function (error) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));
        if (this.changes !== 1) return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null);
    });
}

function update(id, app, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var args = [ ], values = [ ];
    for (var p in app) {
        if (app.hasOwnProperty(p)) {
            args.push(p + ' = ?');
            values.push(app[p]);
        }
    }
    values.push(id);

    db.run('UPDATE apps SET ' + args.join(', ') + ' WHERE id = ?', values, function (error) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));
        if (this.changes !== 1) return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null);
    });
}

