/* jslint node:true */

'use strict';

// this code is intentionally placed before the requires because of circular
// dependancy between database and the *db.js files
exports = module.exports = {
    initialize: initialize,
    create: create,
    removePrivates: removePrivates,
    newTransaction: newTransaction,
    rollback: rollback,
    commit: commit,

    get: get,
    all: all,
    run: run
};

var sqlite3 = require('sqlite3'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    debug = require('debug')('box:database'),
    DatabaseError = require('./databaseerror'),
    assert = require('assert'),
    config = require('../config.js');

var connectionPool = [ ],
    databaseFileName = null,
    db = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); assert(!error); }

function initialize(callback) {
    databaseFileName = config.configRoot + '/config.sqlite.db';
    db = new sqlite3.Database(databaseFileName);

    return callback(null);
}

// create also initializes
function create(callback) {
    var schema = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString('utf8');

    databaseFileName = config.configRoot + '/config.sqlite.db';
    db = new sqlite3.Database(databaseFileName);

    debug('Database created at ' + databaseFileName);

    db.exec(schema, function (err) {
        if (err) return callback(err);

        // TODO this should happen somewhere else..no clue where - Johannes
        var clientdb = require('./clientdb.js');
        clientdb.del('cid-webadmin', function () {
            clientdb.add('cid-webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin || 'https://localhost', function (error) {
                if (error && error.reason !== DatabaseError.ALREADY_EXISTS) return callback(new Error('Error initializing client database with webadmin'));
                return callback(null);
            });
        });
    });
}

function newTransaction() {
    var conn = connectionPool.length !== 0 ? connectionPool.pop() : new sqlite3.Database(databaseFileName);
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

