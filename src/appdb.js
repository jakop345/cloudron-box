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
    ISTATE_PENDING_UNINSTALL: 'pending_uninstall',
    ISTATE_ERROR: 'error',
    ISTATE_DOWNLOADING_MANIFEST: 'downloading_manifest',
    ISTATE_DOWNLOADING_IMAGE: 'downloading_image',
    ISTATE_CREATING_CONTAINER: 'creating_container',
    ISTATE_CREATING_VOLUME: 'creating_volume',
    ISTATE_ALLOCATE_OAUTH_CREDENTIALS: 'allocated_oauth_credentials',
    ISTATE_REGISTERING_SUBDOMAIN: 'registering_subdomain',
    ISTATE_SUBDOMAIN_ERROR: 'subdomain_error',
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

    result.portBindings = [ ];
    var hostPorts = result.hostPorts === null ? [ ] : result.hostPorts.split(',');
    var containerPorts = result.containerPorts === null ? [ ] : result.containerPorts.split(',');

    delete result.hostPorts;
    delete result.containerPorts;

    for (var i = 0; i < hostPorts.length; i++) {
        result.portBindings.push({ hostPort: hostPorts[i], containerPort: containerPorts[i] });
    }
}

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT apps.*, GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts'
                 + ' FROM apps LEFT OUTER JOIN appPortBindings WHERE apps.id = ? GROUP BY appPortBindings.appId', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result);

        callback(null, result);
    });
}

function getBySubdomain(subdomain, callback) {
    assert(typeof subdomain === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT apps.*, GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts'
                 + '  FROM apps LEFT OUTER JOIN appPortBindings WHERE location = ? GROUP BY appPortBindings.appId', [ subdomain ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result);

        callback(null, result);
    });
}

function getAll(callback) {
    database.all('SELECT apps.*, GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts'
                 + ' FROM apps LEFT OUTER JOIN appPortBindings ON apps.id = appPortBindings.appId GROUP BY appPortBindings.appId', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof results === 'undefined') results = [ ];

        results.forEach(postProcess);

        callback(null, results);
    });
}

function add(id, installationState, location, portBindings, callback) {
    assert(typeof id === 'string');
    assert(typeof installationState === 'string');
    assert(typeof location === 'string');
    assert(util.isArray(portBindings));
    assert(typeof callback === 'function');

    portBindings = portBindings || { };

    var appData = {
        $id: id,
        $installationState: installationState,
        $location: location
    };

    var conn = database.newTransaction();

    conn.run('INSERT INTO apps (id, installationState, location) VALUES ($id, $installationState, $location)',
           appData, function (error) {
        if (error) database.rollback(conn);

        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));

        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        async.eachSeries(portBindings, function iterator(binding, callback) {
            var portData = {
                $appId: id,
                $containerPort: binding.containerPort,
                $hostPort: binding.hostPort
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
    database.all('SELECT * FROM appPortBindings WHERE appId = ?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') result = [ ];

        callback(null, result);
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
    assert(typeof callback === 'function');

    var args = [ ], values = [ ];
    for (var p in app) {
        if (!app.hasOwnProperty(p)) continue;

        if (p === 'manifest') {
            args.push('manifestJson = ?');
            values.push(JSON.stringify(app[p]));
        } else {
            args.push(p + ' = ?');
            values.push(app[p]);
        }
    }
    values.push(id);

    database.run('UPDATE apps SET ' + args.join(', ') + ' WHERE id = ?', values, function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null);
    });
}

