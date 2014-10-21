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
    exists: exists,
    del: del,
    update: update,
    getAll: getAll,
    getPortBindings: getPortBindings,
    clear: clear,

    setHealth: setHealth,
    setInstallationCommand: setInstallationCommand,
    setRunCommand: setRunCommand,
    getAppVersions: getAppVersions,

    // status codes
    ISTATE_PENDING_INSTALL: 'pending_install',
    ISTATE_PENDING_CONFIGURE: 'pending_configure',
    ISTATE_PENDING_UNINSTALL: 'pending_uninstall',
    ISTATE_PENDING_RESTORE: 'pending_restore',
    ISTATE_PENDING_UPDATE: 'pending_update',
    ISTATE_ERROR: 'error',
    ISTATE_INSTALLED: 'installed',

    RSTATE_RUNNING: 'running',
    RSTATE_PENDING_START: 'pending_start',
    RSTATE_PENDING_STOP: 'pending_stop',
    RSTATE_STOPPED: 'stopped', // app stopped by user
    RSTATE_DEAD: 'dead', // app stopped on it's own
    RSTATE_ERROR: 'error'
};

var APPS_FIELDS = [ 'id', 'appStoreId', 'version', 'installationState', 'installationProgress', 'runState',
    'healthy', 'containerId', 'manifestJson', 'httpPort', 'location', 'dnsRecordId', 'restrictAccessTo' ].join(',');

var APPS_FIELDS_PREFIXED = [ 'apps.id', 'apps.appStoreId', 'apps.version', 'apps.installationState', 'apps.installationProgress', 'apps.runState',
    'apps.healthy', 'apps.containerId', 'apps.manifestJson', 'apps.httpPort', 'apps.location', 'apps.dnsRecordId', 'apps.restrictAccessTo' ].join(',');

var PORT_BINDINGS_FIELDS = [ 'hostPort', 'containerPort', 'appId' ].join(',');

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

    database.get('SELECT ' + APPS_FIELDS_PREFIXED + ','
        + 'GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts'
        + ' FROM apps LEFT OUTER JOIN appPortBindings WHERE apps.id = ? GROUP BY apps.id', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result);

        callback(null, result);
    });
}

function getBySubdomain(subdomain, callback) {
    assert(typeof subdomain === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + APPS_FIELDS_PREFIXED + ','
        + 'GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts'
        + '  FROM apps LEFT OUTER JOIN appPortBindings WHERE location = ? GROUP BY apps.id', [ subdomain ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        postProcess(result);

        callback(null, result);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    database.all('SELECT ' + APPS_FIELDS_PREFIXED + ','
        + 'GROUP_CONCAT(appPortBindings.hostPort) AS hostPorts, GROUP_CONCAT(appPortBindings.containerPort) AS containerPorts'
        + ' FROM apps LEFT OUTER JOIN appPortBindings ON apps.id = appPortBindings.appId'
        + ' GROUP BY apps.id ORDER BY apps.id', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof results === 'undefined') results = [ ];

        results.forEach(postProcess);

        callback(null, results);
    });
}

function add(id, appStoreId, location, portBindings, restrictAccessTo, callback) {
    assert(typeof id === 'string');
    assert(typeof appStoreId === 'string');
    assert(typeof location === 'string');
    assert(typeof portBindings === 'object');
    assert(typeof restrictAccessTo === 'string');
    assert(typeof callback === 'function');

    portBindings = portBindings || { };

    var conn = database.newTransaction();

    conn.run('INSERT INTO apps (id, appStoreId, installationState, location, restrictAccessTo) VALUES (?, ?, ?, ?, ?)',
           [ id, appStoreId, exports.ISTATE_PENDING_INSTALL, location, restrictAccessTo ], function (error) {
        if (error || !this.lastID) database.rollback(conn);

        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));

        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        async.eachSeries(Object.keys(portBindings), function iterator(containerPort, callback) {
            conn.run('INSERT INTO appPortBindings (hostPort, containerPort, appId) VALUES (?, ?, ?)',
                     [ portBindings[containerPort], containerPort, id ], callback);
        }, function done(error) {
            if (error) database.rollback(conn);

            if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));

            if (error /* || !this.lastID*/) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            database.commit(conn, callback); // FIXME: can this fail?
        });
    });
}

function exists(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT 1 FROM apps WHERE id=?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, err.message));

        return callback(null, typeof result !== 'undefined');
    });
}

function getPortBindings(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.all('SELECT ' + PORT_BINDINGS_FIELDS + ' FROM appPortBindings WHERE appId = ?', [ id ], function (error, results) {
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

function clear(callback) {
    assert(typeof callback === 'function');

    database.run('DELETE FROM appPortBindings', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        database.run('DELETE FROM apps', function (error) {
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
            return callback(null);
        });
    });
}

function update(id, app, callback) {
    updateWithConstraints(id, app, callback);
}

function updateWithConstraints(id, app, constraints, callback) {
    assert(typeof id === 'string');
    assert(typeof app === 'object');
    assert(!('portBindings' in app) || typeof app.portBindings === 'object');

    if (typeof constraints === 'function') {
        callback = constraints;
        constraints = '';
    } else {
        assert(typeof constraints === 'string');
        assert(typeof callback === 'function');
    }

    var portBindings = app.portBindings || { };

    var conn = database.newTransaction();
    async.eachSeries(Object.keys(portBindings), function iterator(containerPort, callback) {
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

        conn.run('UPDATE apps SET ' + args.join(', ') + ' WHERE id = ? ' + constraints, values, function (error) {
            if (error || this.changes !== 1) database.rollback(conn);
            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
            if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

            database.commit(conn, callback);
        });
    });
}

// sets health on installed apps that have a runState which is not null or pending
function setHealth(appId, healthy, runState, callback) {
    assert(typeof appId === 'string');
    assert(typeof healthy === 'boolean');
    assert(typeof runState === 'string');
    assert(typeof callback === 'function');

    var values = {
        healthy: healthy,
        runState: runState
    };

    var constraints = 'AND runState NOT GLOB "pending_*" AND installationState = "installed"';
    if (runState === exports.RSTATE_DEAD) { // don't mark stopped apps as dead
        constraints += ' AND runState != "stopped"';
    }

    updateWithConstraints(appId, values, constraints, callback);
}

function setInstallationCommand(appId, installationState, values, callback) {
    assert(typeof appId === 'string');
    assert(typeof installationState === 'string');

    if (typeof values === 'function') {
        callback = values;
        values = { };
    } else {
        assert(typeof values === 'object');
        assert(typeof callback === 'function');
    }

    values.installationState = installationState;

    if (installationState === exports.ISTATE_PENDING_UNINSTALL) {
        updateWithConstraints(appId, values, '', callback);
    } else {
        updateWithConstraints(appId, values, 'AND installationState NOT GLOB "pending_*"', callback);
    }
}

function setRunCommand(appId, runState, callback) {
    assert(typeof appId === 'string');
    assert(typeof runState === 'string');
    assert(typeof callback === 'function');

    var values = { runState: runState };
    updateWithConstraints(appId, values, 'AND runState NOT GLOB "pending_*" AND installationState = "installed"', callback);
}

function getAppVersions(callback) {
    assert(typeof callback === 'function');

    database.all('SELECT id, appStoreId, version FROM apps', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results = results || [ ];
        callback(null, results);
    });
}

