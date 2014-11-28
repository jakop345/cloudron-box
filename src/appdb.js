/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('box:appdb'),
    safe = require('safetydance'),
    util = require('util');

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

    setAddonConfig: setAddonConfig,
    getAddonConfig: getAddonConfig,
    getAddonConfigByAppId: getAddonConfigByAppId,
    unsetAddonConfig: unsetAddonConfig,
    unsetAddonConfigByAppId: unsetAddonConfigByAppId,

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
    'healthy', 'containerId', 'manifestJson', 'httpPort', 'location', 'dnsRecordId', 'accessRestriction' ].join(',');

var APPS_FIELDS_PREFIXED = [ 'apps.id', 'apps.appStoreId', 'apps.version', 'apps.installationState', 'apps.installationProgress', 'apps.runState',
    'apps.healthy', 'apps.containerId', 'apps.manifestJson', 'apps.httpPort', 'apps.location', 'apps.dnsRecordId', 'apps.accessRestriction' ].join(',');

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

function add(id, appStoreId, location, portBindings, accessRestriction, callback) {
    assert(typeof id === 'string');
    assert(typeof appStoreId === 'string');
    assert(typeof location === 'string');
    assert(typeof portBindings === 'object');
    assert(typeof accessRestriction === 'string');
    assert(typeof callback === 'function');

    portBindings = portBindings || { };

    var conn = database.beginTransaction();

    conn.run('INSERT INTO apps (id, appStoreId, installationState, location, accessRestriction) VALUES (?, ?, ?, ?, ?)',
           [ id, appStoreId, exports.ISTATE_PENDING_INSTALL, location, accessRestriction ], function (error) {
        if (error || !this.lastID) database.rollback(conn);

        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));

        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        async.eachSeries(Object.keys(portBindings), function iterator(containerPort, callback) {
            conn.run('INSERT INTO appPortBindings (hostPort, containerPort, appId) VALUES (?, ?, ?)',
                     [ portBindings[containerPort], containerPort, id ], callback);
        }, function done(error) {
            if (error) database.rollback(conn);

            if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));

            if (error /* || !this.lastID*/) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

            database.commit(conn, callback);
        });
    });
}

function exists(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT 1 FROM apps WHERE id=?', [ id ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

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

    var conn = database.beginTransaction();
    conn.run('DELETE FROM appPortBindings WHERE appId = ?', [ id ], function (error) {
        conn.run('DELETE FROM apps WHERE id = ?', [ id ], function (error) {
            if (error || this.changes !== 1) database.rollback(conn);

            if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
            if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

            database.commit(conn, callback);
        });
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    async.series([
        database.run.bind(null, 'DELETE FROM appPortBindings'),
        database.run.bind(null, 'DELETE FROM apps'),
        database.run.bind(null, 'DELETE FROM appAddonConfigs')
    ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        return callback(null);
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

    var conn = database.beginTransaction();
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

function setAddonConfig(appId, addonId, env, callback) {
    assert(typeof appId === 'string');
    assert(typeof addonId === 'string');
    assert(util.isArray(env));
    assert(typeof callback === 'function');

    if (env.length === 0) return callback(null);

    var query = 'INSERT INTO appAddonConfigs(appId, addonId, value) VALUES ';
    var args = [ ], queryArgs = [ ];
    for (var i = 0; i < env.length; i++) {
        args.push(appId, addonId, env[i]);
        queryArgs.push('(?, ?, ?)');
    }

    database.run(query + queryArgs.join(','), args, function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function unsetAddonConfig(appId, addonId, callback) {
    assert(typeof appId === 'string');
    assert(typeof addonId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM appAddonConfigs WHERE appId = ? AND addonId = ?', [ appId, addonId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function unsetAddonConfigByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM appAddonConfigs WHERE appId = ?', [ appId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function getAddonConfig(appId, addonId, callback) {
    assert(typeof appId === 'string');
    assert(typeof addonId === 'string');
    assert(typeof callback === 'function');

    database.all('SELECT value FROM appAddonConfigs WHERE appId = ? AND addonId = ?', [ appId, addonId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        var config = [ ];
        result.forEach(function (v) { config.push(v.value); });

        callback(null, config);
    });
}

function getAddonConfigByAppId(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    database.all('SELECT value FROM appAddonConfigs WHERE appId = ?', [ appId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        var config = [ ];
        result.forEach(function (v) { config.push(v.value); });

        callback(null, config);
    });
}

