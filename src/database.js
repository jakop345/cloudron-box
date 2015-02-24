/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    config = require('../config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:database'),
    paths = require('./paths.js'),
    sqlite3 = require('sqlite3');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    removePrivates: removePrivates,
    beginTransaction: beginTransaction,
    rollback: rollback,
    commit: commit,

    get: get,
    all: all,
    run: run,

    // exported for testing
    _clear: clear
};

var gConnectionPool = [ ], // used to track active transactions
    gDatabase = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); };

function initialize(callback) {
    gDatabase = new sqlite3.Database(paths.DATABASE_FILENAME);
    gDatabase.on('error', function (error) {
        console.error('Database error in ' + paths.DATABASE_FILENAME + ':', error);
    });

    gDatabase.run('PRAGMA busy_timeout=5000', callback);
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    debug('Closing database');
    gDatabase.close();
    gDatabase = null;

    debug('Closing %d active transactions', gConnectionPool.length);
    gConnectionPool.forEach(function (conn) { conn.close(); });
    gConnectionPool = [ ];

    callback(null);
}

function clear(callback) {
    assert(typeof callback === 'function');

    async.series([
        require('./appdb.js')._clear,
        require('./authcodedb.js')._clear,
        require('./clientdb.js')._clear,
        require('./tokendb.js')._clear,
        require('./userdb.js')._clear
    ], callback);
}

function beginTransaction() {
    var conn = new sqlite3.Database(paths.DATABASE_FILENAME);
    conn._started = Date.now();
    conn._slowWarningIntervalId = setInterval((function () {
        debug('Transaction running for %d msecs', Date.now() - this._started);
    }).bind(conn), 2000);

    gConnectionPool.push(conn);
    conn.serialize();
    conn.run('PRAGMA busy_timeout=5000', NOOP_CALLBACK);
    conn.run('BEGIN TRANSACTION', NOOP_CALLBACK);
    return conn;
}

function rollback(conn, callback) {
    gConnectionPool.splice(gConnectionPool.indexOf(conn), 1);
    conn.run('ROLLBACK', NOOP_CALLBACK);
    clearInterval(conn._slowWarningIntervalId);
    debug('Transaction took %d msecs', Date.now() - conn._started);
    conn.close(); // close waits for pending statements
    if (callback) callback();
}

function commit(conn, callback) {
    gConnectionPool.splice(gConnectionPool.indexOf(conn), 1);
    conn.run('COMMIT', function (error) {
        clearInterval(conn._slowWarningIntervalId);
        debug('Transaction took %d msecs', Date.now() - conn._started);
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
    conn.close(); // close waits for pending statements
}

function removePrivates(obj) {
    var res = { };

    for (var p in obj) {
        if (!obj.hasOwnProperty(p)) continue;
        if (p.substring(0, 1) === '_') continue;
        res[p] = obj[p]; // ## make deep copy?
    }

    return res;
}

function get() {
    return gDatabase.get.apply(gDatabase, arguments);
}

function all() {
    return gDatabase.all.apply(gDatabase, arguments);
}

function run() {
    return gDatabase.run.apply(gDatabase, arguments);
}

