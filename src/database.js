/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    config = require('../config.js'),
    debug = require('debug')('box:database'),
    paths = require('./paths.js'),
    sqlite3 = require('sqlite3');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    removePrivates: removePrivates,
    newTransaction: newTransaction,
    rollback: rollback,
    commit: commit,
    clear: clear,

    get: get,
    all: all,
    run: run
};

var gConnectionPool = [ ],
    gDatabase = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); assert(!error); };

function initialize(callback) {
    gDatabase = new sqlite3.Database(paths.DATABASE_FILENAME);
    gDatabase.on('error', function (error) {
        console.error('Database error in ' + paths.DATABASE_FILENAME + ':', error);
    });

    return callback(null);
}

function uninitialize() {
    debug('Closing database');
    gDatabase.close();
    gDatabase = null;

    gConnectionPool.forEach(function (conn) { conn.close(); });
    gConnectionPool = [ ];
}

function clear(callback) {
    async.series([
        require('./appdb.js').clear,
        require('./authcodedb.js').clear,
        require('./clientdb.js').clear,
        require('./tokendb.js').clear,
        require('./userdb.js').clear
    ], callback);
}

function newTransaction() {
    var conn = gConnectionPool.length !== 0 ? gConnectionPool.pop() : new sqlite3.Database(paths.DATABASE_FILENAME);
    conn.serialize();
    conn.run('BEGIN TRANSACTION', NOOP_CALLBACK);
    return conn;
}

function rollback(conn, callback) {
    gConnectionPool.push(conn);
    conn.run('ROLLBACK', callback);
}

function commit(conn, callback) {
    gConnectionPool.push(conn);
    conn.run('COMMIT', callback);
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

