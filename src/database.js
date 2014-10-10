/* jslint node:true */

'use strict';

var sqlite3 = require('sqlite3'),
    fs = require('fs'),
    uuid = require('node-uuid'),
    path = require('path'),
    debug = require('debug')('box:database'),
    DatabaseError = require('./databaseerror'),
    assert = require('assert'),
    config = require('../config.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    create: create,
    removePrivates: removePrivates,
    newTransaction: newTransaction,
    rollback: rollback,
    commit: commit,

    get: get,
    all: all,
    run: run
};

var connectionPool = [ ],
    databaseFileName = null,
    db = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); assert(!error); };

function initialize(callback) {
    databaseFileName = config.configRoot + '/config.sqlite.db';
    db = new sqlite3.Database(databaseFileName);
    db.on('error', function (error) {
        console.error('Database error in ' + databaseFileName + ':', error);
    });

    return callback(null);
}

function uninitialize() {
    debug('Closing database');
    db.close();
    databaseFileName = null;
    db = null;

    connectionPool.forEach(function (conn) { conn.close(); });
    connectionPool = [ ];
}

// create also initializes
function create(callback) {
    var schema = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString('utf8');

    databaseFileName = config.configRoot + '/config.sqlite.db';

    db = new sqlite3.Database(databaseFileName);
    db.on('error', function (error) {
        console.error('Database error in ' + databaseFileName + ':', error);
    });

    debug('Database created at ' + databaseFileName);

    db.exec(schema, function (err) {
        if (err) return callback(err);

        // add webadmin as an OAuth client if not already there
        var clientdb = require('./clientdb.js');
        clientdb.getByAppId('webadmin', function (error) {
            if (!error) return callback(null);

            clientdb.add(uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin, '*,roleAdmin', function (error) {
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

