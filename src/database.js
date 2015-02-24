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

function reconnect(callback) {
    callback = callback || function () { };

    gConnectionPool.getConnection(function (error, connection) {
        if (error) {
            console.error('Unable to reestablish connection to database. Try again in a bit.', error.message);
            setTimeout(reconnect, 1000);
            return;
        }

        connection.on('error', function (error) {
            console.error('Lost connection to database server. Reason: %s. Reestablishing...', error.message);
            reconnect();
        });

        connection.query('USE ' + config.database().name + ';', function (error) {
            if (error) return callback(error);

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

        connection.on('error', console.error); // this needs to match the removeListener below

        connection.query('USE ' + config.database().name + ';', function (error) {
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

    connection.rollback(function () {
        connection.removeListener('error', console.error);

        connection.release();
        callback(null);
    });
}

function commit(connection, callback) {
    assert(typeof callback === 'function');

    connection.commit(function (error) {
        if (error) return rollback(connection, callback);

        connection.removeListener('error', console.error);
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

