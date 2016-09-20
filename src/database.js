'use strict';

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    query: query,
    transaction: transaction,

    beginTransaction: beginTransaction,
    rollback: rollback,
    commit: commit,

    _clear: clear
};

var assert = require('assert'),
    async = require('async'),
    child_process = require('child_process'),
    config = require('./config.js'),
    mysql = require('mysql'),
    once = require('once'),
    util = require('util');

var gConnectionPool = null,
    gDefaultConnection = null;

function initialize(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {
            connectionLimit: 5
        };
    }

    assert.strictEqual(typeof options.connectionLimit, 'number');
    assert.strictEqual(typeof callback, 'function');

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

    gConnectionPool.on('connection', function (connection) {
        connection.query('USE ' + config.database().name);
        connection.query('SET SESSION sql_mode = \'strict_all_tables\'');
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
    callback = callback ? once(callback) : function () {};

    gConnectionPool.getConnection(function (error, connection) {
        if (error) {
            console.error('Unable to reestablish connection to database. Try again in a bit.', error.message);
            return setTimeout(reconnect.bind(null, callback), 1000);
        }

        connection.on('error', function (error) {
            // by design, we catch all normal errors by providing callbacks.
            // this function should be invoked only when we have no callbacks pending and we have a fatal error
            assert(error.fatal, 'Non-fatal error on connection object');

            console.error('Unhandled mysql connection error.', error);

            // This is most likely an issue an can cause double callbacks from reconnect()
            setTimeout(reconnect.bind(null, callback), 1000);
        });

        gDefaultConnection = connection;

        callback(null);
    });
}

function clear(callback) {
    assert.strictEqual(typeof callback, 'function');

    var cmd = util.format('mysql --host=%s --user="%s" --password="%s" -Nse "SHOW TABLES" %s | grep -v "^migrations$" | while read table; do mysql --host=%s --user="%s" --password="%s" -e "SET FOREIGN_KEY_CHECKS = 0; TRUNCATE TABLE $table" %s; done',
        config.database().hostname, config.database().username, config.database().password, config.database().name,
        config.database().hostname, config.database().username, config.database().password, config.database().name);

    async.series([
        child_process.exec.bind(null, cmd),
        require('./clientdb.js')._addDefaultClients,
        require('./groupdb.js')._addDefaultGroups
    ], callback);
}

function beginTransaction(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gConnectionPool === null) return callback(new Error('No database connection pool.'));

    gConnectionPool.getConnection(function (error, connection) {
        if (error) {
            console.error('Unable to get connection to database. Try again in a bit.', error.message);
            return setTimeout(beginTransaction.bind(null, callback), 1000);
        }

        connection.beginTransaction(function (error) {
            if (error) return callback(error);

            return callback(null, connection);
        });
    });
}

function rollback(connection, callback) {
    assert.strictEqual(typeof callback, 'function');

    connection.rollback(function (error) {
        if (error) console.error(error); // can this happen?

        connection.release();
        callback(null);
    });
}

// FIXME: if commit fails, is it supposed to return an error ?
function commit(connection, callback) {
    assert.strictEqual(typeof callback, 'function');

    connection.commit(function (error) {
        if (error) return rollback(connection, callback);

        connection.release();
        return callback(null);
    });
}

function query() {
    var args = Array.prototype.slice.call(arguments);
    var callback = args[args.length - 1];
    assert.strictEqual(typeof callback, 'function');

    if (gDefaultConnection === null) return callback(new Error('No connection to database'));

    args[args.length -1 ] = function (error, result) {
        if (error && error.fatal) {
            gDefaultConnection = null;
            setTimeout(reconnect, 1000);
        }

        callback(error, result);
    };

    gDefaultConnection.query.apply(gDefaultConnection, args);
}

function transaction(queries, callback) {
    assert(util.isArray(queries));
    assert.strictEqual(typeof callback, 'function');

    beginTransaction(function (error, conn) {
        if (error) return callback(error);

        async.mapSeries(queries, function iterator(query, done) {
            conn.query(query.query, query.args, done);
        }, function seriesDone(error, results) {
            if (error) return rollback(conn, callback.bind(null, error));

            commit(conn, callback.bind(null, null, results));
        });
    });
}

