/* jslint node:true */

'use strict';

// this code is intentionally placed before the requires because of circular
// dependancy between database and the *db.js files
exports = module.exports = {
    initialize: initialize,
    removePrivates: removePrivates,
    newTransaction: newTransaction,
    rollback: rollback,
    commit: commit
};

var userdb = require('./userdb.js'),
    tokendb = require('./tokendb.js'),
    clientdb = require('./clientdb.js'),
    authcodedb = require('./authcodedb.js'),
    appdb = require('./appdb.js'),
    sqlite3 = require('sqlite3'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    debug = require('debug')('box:database'),
    DatabaseError = require('./databaseerror');

var connectionPool = [ ],
    databaseFileName = null;

var NOOP_CALLBACK = function (error) { if (error) console.error(error); }

function initialize(config, callback) {
    var schema = fs.readFileSync(path.join(__dirname, 'schema.sql')).toString('utf8');

    databaseFileName = config.configRoot + '/config.sqlite.db';

    var db = new sqlite3.Database(databaseFileName);
    debug('Database created at ' + databaseFileName);

    db.exec(schema, function (err) {
        if (err) return callback(err);

        userdb.init(db);
        tokendb.init(db);
        clientdb.init(db);
        authcodedb.init(db);
        appdb.init(db);

        // TODO this should happen somewhere else..no clue where - Johannes
        clientdb.del('cid-webadmin', function () {
            clientdb.add('cid-webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.origin || 'https://localhost', function (error) {
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
    conn.run('ROLLBACK', callback);
    connectionPool.push(conn);
}

function commit(conn, callback) {
    conn.run('COMMIT', callback);
    connectionPool.push(conn);
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

