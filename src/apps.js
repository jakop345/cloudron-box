/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    debug = require('debug')('box:apps'),
    assert = require('assert'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    child_process = require('child_process'),
    config = require('../config.js');

exports = module.exports = {
    AppsError: AppsError,

    initialize: initialize,
    uninitialize: uninitialize,
    get: get,
    getBySubdomain: getBySubdomain,
    getAll: getAll,
    install: install,
    configure: configure,
    uninstall: uninstall,
    update: update,

    start: start,
    stop: stop,

    appFqdn: appFqdn
};

var tasks = { }, appHealthTask = null;

function initialize() {
    appHealthTask = child_process.fork(__dirname + '/apphealthtask.js');

    resume(); // FIXME: potential race here since resume is async
}

function startTask(appId) {
    assert(!(appId in tasks));

    tasks[appId] = child_process.fork(__dirname + '/apptask.js', [ appId ]);
    tasks[appId].once('exit', function (code, signal) {
        debug('Task completed :' + appId);
        delete tasks[appId];
    });
}

function stopTask(appId) {
    if (tasks[appId]) {
        debug('Killing existing task : ' + tasks[appId].pid);
        tasks[appId].kill();
        delete tasks[appId];
    }
}

// resume install and uninstalls
function resume() {
    appdb.getAll(function (error, apps) {
        if (error) throw error;
        apps.forEach(function (app) {
            debug('Creating process for ' + app.id + ' with state ' + app.installationState);
            startTask(app.id);
        });
    });
}

function uninitialize() {
    appHealthTask.kill();
    appHealthTask = null;
    for (var appId in tasks) {
        stopTask(appId);
    }
}

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AppsError(reason, info) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    this.message = !info ? reason : (typeof info === 'object' ? JSON.stringify(info) : info);
}
util.inherits(AppsError, Error);
AppsError.INTERNAL_ERROR = 1;
AppsError.ALREADY_EXISTS = 2;
AppsError.NOT_FOUND = 3;
AppsError.BAD_FIELD = 4;
AppsError.BAD_STATE = 5;

function appFqdn(location) {
    return location + '-' + config.fqdn;
}

// http://stackoverflow.com/questions/7930751/regexp-for-subdomain
function validateSubdomain(subdomain, fqdn) {
    var RESERVED_SUBDOMAINS = [ 'admin' ];

    if (RESERVED_SUBDOMAINS.indexOf(subdomain) !== -1) return new Error(subdomain + ' location is reserved');

    if (subdomain.length > 63) return new Error('Subdomain length cannot be greater than 63');
    if (subdomain.match(/^[A-Za-z0-9-]+$/) === null) return new Error('Subdomain can only contain alphanumerics and hyphen');
    if (subdomain[0] === '-' || subdomain[subdomain.length-1] === '-') return new Error('Subdomain cannot start or end with hyphen');

    if (subdomain.length + 1 /* dot */ + fqdn.length > 255) return new Error('Domain length exceeds 255 characters');

    return null;
}

// validate the port bindings
function validatePortBindings(portBindings) {
    for (var containerPort in portBindings) {
        var containerPortInt = parseInt(containerPort, 10);
        if (isNaN(containerPortInt) || containerPortInt <= 0 || containerPortInt > 65535) {
            return callback(new AppsError(AppsError.BAD_FIELD, containerPort + ' is not a valid port'));
        }

        var hostPortInt = parseInt(portBindings[containerPort], 10);
        if (isNaN(hostPortInt) || hostPortInt <= 1024 || hostPortInt > 65535) {
            return callback(new AppsError(AppsError.BAD_FIELD, portBindings[containerPort] + ' is not a valid port'));
        }
    }
}

function get(appId, callback) {
    assert(typeof appId === 'string');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        callback(null, app);
    });
}

function getBySubdomain(subdomain, callback) {
    assert(typeof subdomain === 'string');

    appdb.getBySubdomain(subdomain, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        callback(null, app);
    });
}

function getAll(callback) {
    appdb.getAll(function (error, apps) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        apps.forEach(function (app) {
            app.iconUrl = config.appServerUrl + '/api/v1/appstore/apps/' + app.id + '/icon';
            app.fqdn = appFqdn(app.location);
        });

        callback(null, apps);
    });
}

function install(appId, appStoreId, username, password, location, portBindings, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof location === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof callback === 'function');

    var error = validateSubdomain(location, config.fqdn);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validatePortBindings(portBindings);
    if (error) return callback(error);

    stopTask(appId);

    appdb.add(appId, appStoreId, location, portBindings, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError(AppsError.ALREADY_EXISTS));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debug('Will install app with id : ' + appId);

        startTask(appId);

        callback(null);
    });
}

function configure(appId, username, password, location, portBindings, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof callback === 'function');

    var error = location ? validateSubdomain(location, config.fqdn) : null;
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = portBindings ? validatePortBindings(portBindings) : null;
    if (error) return callback(error);

    stopTask(appId);

    var values = { installationState: appdb.ISTATE_PENDING_CONFIGURE };
    if (location) values.location = location;
    values.portBindings = portBindings;

    appdb.update(appId, values, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debug('Will configure app with id : ' + appId);

        startTask(appId);

        callback(null);
    });
}

function update(appId, callback) {
    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debug('Will update with id : ' + appId);

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, 'App not in installed state'));

        appdb.update(appId, { installationState: appdb.ISTATE_PENDING_UPDATE }, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            debug('Will configure app with id : ' + appId);

            stopTask(appId);
            startTask(appId);

            callback(null);
        });
    });
}

function uninstall(appId, callback) {
    assert(typeof appId === 'string');

    stopTask(appId);

    appdb.update(appId, { installationState: appdb.ISTATE_PENDING_UNINSTALL }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debug('Will uninstall app with id : ' + appId);

        startTask(appId);

        callback(null);
    });
}

function start(appId, callback) {
    assert(typeof appId === 'string');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debug('Will start app with id : ' + appId);
        debug('ISTATE:' + app.installationState + ' RSTATE:' + app.runState);

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, 'App not in installed state'));
        if (app.runState !== appdb.RSTATE_STOPPED && app.runState !== appdb.RSTATE_ERROR) return callback(new AppsError(AppsError.BAD_STATE, 'Cannot start app with runState:' + app.runState));

        appdb.update(appId, { runState: appdb.RSTATE_PENDING_START }, function (error) {
            stopTask(appId);
            startTask(appId);

            callback(null);
        });

    });
}

function stop(appId, callback) {
    assert(typeof appId === 'string');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debug('Will stop app with id : ' + appId);
        debug('ISTATE:' + app.installationState + ' RSTATE:' + app.runState);

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_FIELD, 'App not installed'));
        if (app.runState !== appdb.RSTATE_RUNNING) return callback(new AppsError(AppsError.BAD_STATE, 'Cannot start app with runState:' + app.runState));

        appdb.update(appId, { runState: appdb.RSTATE_PENDING_STOP }, function (error) {
            stopTask(appId);
            startTask(appId);

            callback(null);
        });
    });
}

