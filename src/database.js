/* jslint node:true */

'use strict';

var sqlite3 = require('sqlite3'),
    fs = require('fs'),
    uuid = require('node-uuid'),
    path = require('path'),
    debug = require('debug')('box:database'),
    async = require('async'),
    DatabaseError = require('./databaseerror'),
    assert = require('assert'),
    config = require('../config.js');

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

var connectionPool = [ ],
    db = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); assert(!error); };

function initialize(callback) {
    db = new sqlite3.Database(config.databaseFileName);
    db.on('error', function (error) {
        console.error('Database error in ' + config.databaseFileName + ':', error);
    });

    return callback(null);
}

function uninitialize() {
    debug('Closing database');
    db.close();
    db = null;

    connectionPool.forEach(function (conn) { conn.close(); });
    connectionPool = [ ];
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
    var conn = connectionPool.length !== 0 ? connectionPool.pop() : new sqlite3.Database(config.databaseFileName);
    conn.serialize();
    conn.run('BEGIN TRANSACTION', NOOP_CALLBACK);
    return conn;
}

function rollback(conn, callback) {
    connectionPool.push(conn);
    conn.run('ROLLBACK', callback);
}

function commit(conn, callback) {
    connectionPool.push(conn);
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
    return db.get.apply(db, arguments);
}

function all() {
    return db.all.apply(db, arguments);
}

function run() {
    return db.run.apply(db, arguments);
}

