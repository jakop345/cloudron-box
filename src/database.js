/* jslint node: true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    config = require('../config.js'),
    mysql = require('mysql'),
    util = require('util');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    query: query,
    beginTransaction: beginTransaction,
    rollback: rollback,
    commit: commit,

    _clear: clear,
};


var gConnectionPool = null,
    gDefaultConnection = null;

function initialize(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {
            connectionLimit: 5
        };
    }

    assert(typeof options.connectionLimit === 'number');
    assert(typeof callback === 'function');

    if (gConnectionPool !== null) return callback(null);

    gConnectionPool  = mysql.createPool({
        connectionLimit: options.connectionLimit,
        host: config.database().hostname,
        user: config.database().username,
        password: config.database().password,
        port: config.database().port,
        database: config.database().name,
        multipleStatements: false,
        ssl: false
    });

    reconnect(callback);
}

function uninitialize(callback) {
    if (gConnectionPool) {
        gConnectionPool.end(callback);
        gConnectionPool = null;
    } else {
        callback(null);
    }
}

function setupConnection(connection, callback) {
    assert(typeof connection === 'object');
    assert(typeof callback === 'function');

    connection.on('error', console.error);

    async.series([
        connection.query.bind(connection, 'USE ' + config.database().name),
        connection.query.bind(connection, 'SET SESSION sql_mode = \'strict_all_tables\'')
    ], callback);
}

function reconnect(callback) {
    callback = callback || function () { };

    gConnectionPool.getConnection(function (error, connection) {
        if (error) {
            console.error('Unable to reestablish connection to database. Try again in a bit.', error.message);
            return setTimeout(reconnect.bind(null, callback), 1000);
        }

        connection.on('error', reconnect);

        setupConnection(connection, function (error) {
            if (error) return setTimeout(reconnect.bind(null, callback), 1000);
 
            gDefaultConnection = connection;
 
            callback(null);
        });
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    // the clear funcs don't completely clear the db, they leave the migration code defaults
    async.series([
        require('./appdb.js')._clear,
        require('./authcodedb.js')._clear,
        require('./clientdb.js')._clear,
        require('./tokendb.js')._clear,
        require('./userdb.js')._clear
    ], callback);
}

function beginTransaction(callback) {
    assert(typeof callback === 'function');

    gConnectionPool.getConnection(function (error, connection) {
        if (error) return callback(error);

        setupConnection(connection, function (error) {
            if (error) return callback(error);

            connection.beginTransaction(function (error) {
                if (error) return callback(error);

                return callback(null, connection);
            });
        });
    });
}

function rollback(connection, callback) {
    assert(typeof callback === 'function');

    connection.rollback(function (error) {
        if (error) console.error(error); // can this happen?

        connection.removeAllListeners('error');
        connection.release();
        callback(null);
    });
}

function commit(connection, callback) {
    assert(typeof callback === 'function');

    connection.commit(function (error) {
        if (error) return rollback(connection, callback);

        connection.removeAllListeners('error');
        connection.release();

        return callback(null);
    });
}

function query() {
    var args = Array.prototype.slice.call(arguments);
    var callback = args[args.length - 1];
    assert(typeof callback === 'function');

    if (gDefaultConnection === null) return callback(new Error('No connection to database'));

    gDefaultConnection.query.apply(gDefaultConnection, args);
}

