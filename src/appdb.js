/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:appdb'),
    assert = require('assert'),
    database = require('./database.js'),
    async = require('async'),
    util = require('util'),
    safe = require('safetydance');

exports = module.exports = {
    get: get,
    getBySubdomain: getBySubdomain,
    add: add,
    del: del,
    update: update,
    getAll: getAll,
    getPortBindings: getPortBindings,

    // status codes
    ISTATE_PENDING_INSTALL: 'pending_install',
    ISTATE_PENDING_CONFIGURE: 'pending_configure',
    ISTATE_PENDING_UNINSTALL: 'pending_uninstall',
    ISTATE_ERROR: 'error',
    ISTATE_INSTALLED: 'installed',

    RSTATE_RUNNING: 'running',
    RSTATE_PENDING_STOP: 'pending_stop',
    RSTATE_STOPPED: 'stopped',
    RSTATE_ERROR: 'error'
};

function postProcess(result) {
    assert(result.manifestJson === null || typeof result.manifestJson === 'string');

    result.manifest = safe.JSON.parse(result.manifestJson);
    delete result.manifestJson;

    assert(result.hostPorts === null || typeof result.hostPorts === 'string');
    assert(result.containerPorts === null || typeof result.containerPorts === 'string');

    result.portBindings = { };
    var hostPorts = result.hostPorts === null ? [ ] : result.hostPorts.split(',');
    var containerPorts = result.containerPorts === null ? [ ] : result.containerPorts.split(',');

    delete result.hostPorts;
    delete result.containerPorts;

    for (var i = 0; i < hostPorts.length; i++) {
        result.portBindings[containerPorts[i]] = hostPorts[i];
    }
}

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT apps.*, GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts' +
                 ' FROM apps LEFT OUTER JOIN appPortBindings WHERE apps.id = ? GROUP BY apps.id', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result);

        callback(null, result);
    });
}

function getBySubdomain(subdomain, callback) {
    assert(typeof subdomain === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT apps.*, GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts' +
                 '  FROM apps LEFT OUTER JOIN appPortBindings WHERE location = ? GROUP BY apps.id', [ subdomain ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result);

        callback(null, result);
    });
}

function getAll(callback) {
    database.all('SELECT apps.*, GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts' +
                 ' FROM apps LEFT OUTER JOIN appPortBindings ON apps.id = appPortBindings.appId GROUP BY apps.id ORDER BY apps.id', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof results === 'undefined') results = [ ];

        results.forEach(postProcess);

        callback(null, results);
    });
}

function add(id, location, portBindings, callback) {
    assert(typeof id === 'string');
    assert(typeof location === 'string');
    assert(typeof portBindings === 'object');
    assert(typeof callback === 'function');

    portBindings = portBindings || { };

    var appData = {
        $id: id,
        $installationState: exports.ISTATE_PENDING_INSTALL,
        $location: location
    };

    var conn = database.newTransaction();

    conn.run('INSERT INTO apps (id, installationState, location) VALUES ($id, $installationState, $location)',
           appData, function (error) {
        if (error || !this.lastID) database.rollback(conn);

        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));

        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        async.eachSeries(Object.keys(portBindings), function iterator(containerPort, callback) {
            var portData = {
                $appId: id,
                $containerPort: containerPort,
                $hostPort: portBindings[containerPort]
            };

            conn.run('INSERT INTO appPortBindings (hostPort, containerPort, appId) VALUES ($hostPort, $containerPort, $appId)', portData, callback);
        }, function done(error) {
            if (error) database.rollback(conn);

            if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));

            if (error /* || !this.lastID*/) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            database.commit(conn, callback); // FIXME: can this fail?
        });
    });
}

function getPortBindings(id, callback) {
    database.all('SELECT * FROM appPortBindings WHERE appId = ?', [ id ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results = results || [ ];
        var portBindings = { };
        for (var i = 0; i < results.length; i++) {
            portBindings[results[i].containerPort] = results[i].hostPort;
        }

        callback(null, portBindings);
    });
}

function del(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    var conn = database.newTransaction();
    conn.run('DELETE FROM appPortBindings WHERE appId = ?', [ id ], function (error) {
        conn.run('DELETE FROM apps WHERE id = ?', [ id ], function (error) {
            if (error || this.changes !== 1) database.rollback(conn);

            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
            if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

            database.commit(conn, callback); // FIXME: can this fail?
        });
    });
}

function update(id, app, callback) {
    assert(typeof id === 'string');
    assert(typeof app === 'object');
    assert(!('portBindings' in app) || typeof app.portBindings === 'object');
    assert(typeof callback === 'function');

    var portBindings = app.portBindings || { };

    var conn = database.newTransaction();
    async.eachSeries(Object.keys(portBindings), function iterator(containerPort, callback) {
        var portData = {
            $appId: id,
            $containerPort: containerPort,
            $hostPort: portBindings[containerPort]
        };

        var values = [ portBindings[containerPort], containerPort, id ];
        conn.run('UPDATE appPortBindings SET hostPort = ? WHERE containerPort = ? AND appId = ?', values, callback);
    }, function seriesDone(error) {
        if (error) {
            database.rollback(conn);
            return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        }

        var args = [ ], values = [ ];
        for (var p in app) {
            if (!app.hasOwnProperty(p)) continue;

            if (p === 'manifest') {
                args.push('manifestJson = ?');
                values.push(JSON.stringify(app[p]));
            } else if (p !== 'portBindings') {
                args.push(p + ' = ?');
                values.push(app[p]);
            }
        }

        if (values.length === 0) return database.commit(conn, callback);

        values.push(id);

        conn.run('UPDATE apps SET ' + args.join(', ') + ' WHERE id = ?', values, function (error) {
            if (error || this.changes !== 1) database.rollback(conn);
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
            if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

            database.commit(conn, callback);
        });
    });
}

