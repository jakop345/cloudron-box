/* jslint node:true */

'use strict';

var appdb = require('./appdb.js'),
    assert = require('assert'),
    child_process = require('child_process'),
    config = require('../config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apps'),
    docker = require('./docker.js'),
    fs = require('fs'),
    os = require('os'),
    paths = require('./paths.js'),
    semver = require('semver'),
    split = require('split'),
    stream = require('stream'),
    util = require('util');

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

    getLogStream: getLogStream,
    getLogs: getLogs,

    start: start,
    stop: stop,

    // exported for testing
    _validateHostname: validateHostname,
    _validatePortBindings: validatePortBindings
};

var gTasks = { };

function initialize(callback) {
    assert(typeof callback === 'function');

    resume(callback); // TODO: potential race here since resume is async
}

function startTask(appId) {
    assert(typeof appId === 'string');
    assert(!(appId in gTasks));

    gTasks[appId] = child_process.fork(__dirname + '/apptask.js', [ appId ]);
    gTasks[appId].once('exit', function (code, signal) {
        debug('Task completed :' + appId);
        delete gTasks[appId];
    });
}

function stopTask(appId) {
    assert(typeof appId === 'string');

    if (gTasks[appId]) {
        debug('Killing existing task : ' + gTasks[appId].pid);
        gTasks[appId].kill();
        delete gTasks[appId];
    }
}

// resume install and uninstalls
function resume(callback) {
    assert(typeof callback === 'function');

    appdb.getAll(function (error, apps) {
        if (error) return callback(error);

        apps.forEach(function (app) {
            debug('Creating process for ' + app.id + ' with state ' + app.installationState);
            startTask(app.id);
        });

        callback(null);
    });
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    for (var appId in gTasks) {
        stopTask(appId);
    }

    callback(null);
}

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AppsError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(AppsError, Error);
AppsError.INTERNAL_ERROR = 'Internal Error';
AppsError.ALREADY_EXISTS = 'Already Exists';
AppsError.NOT_FOUND = 'Not Found';
AppsError.BAD_FIELD = 'Bad Field';
AppsError.BAD_STATE = 'Bad State';

// Hostname validation comes from RFC 1123 (section 2.1)
// Domain name validation comes from RFC 2181 (Name syntax)
// https://en.wikipedia.org/wiki/Hostname#Restrictions_on_valid_host_names
// We are validating the validity of the location-fqdn as host name
function validateHostname(location, fqdn) {
    var RESERVED_LOCATIONS = [ 'admin', 'my' ];

    if (RESERVED_LOCATIONS.indexOf(location) !== -1) return new Error(location + ' is reserved');

    if ((location.length + 1 + /* hyphen */ + fqdn.indexOf('.')) > 63) return new Error('Hostname length cannot be greater than 63');
    if (location.match(/^[A-Za-z0-9-]+$/) === null) return new Error('Hostname can only contain alphanumerics and hyphen');
    if (location[0] === '-' || location[location.length-1] === '-') return new Error('Hostname cannot start or end with hyphen');
    if (location.length + 1 /* hyphen */ + fqdn.length > 253) return new Error('FQDN length exceeds 253 characters');

    return null;
}

// validate the port bindings
function validatePortBindings(portBindings) {
    // keep the public ports in sync with firewall rules in scripts/initializeBaseUbuntuImage.sh
    var RESERVED_PORTS = [
        22, /* ssh */
        25, /* smtp */
        53, /* dns */
        80, /* http */
        443, /* https */
        2003, /* graphite */
        2004, /* graphite */
        2020, /* install server */
        3000, /* app server */
        8000 /* graphite */
    ];

    for (var containerPort in portBindings) {
        var containerPortInt = parseInt(containerPort, 10);
        if (isNaN(containerPortInt) || containerPortInt <= 0 || containerPortInt > 65535) {
            return new Error(containerPort + ' is not a valid port');
        }

        var hostPortInt = parseInt(portBindings[containerPort], 10);
        if (isNaN(hostPortInt) || hostPortInt <= 1024 || hostPortInt > 65535) {
            return new Error(portBindings[containerPort] + ' is not a valid port');
        }

        if (RESERVED_PORTS.indexOf(hostPortInt) !== -1) return new Error(hostPortInt + ' is reserved');
    }

    return null;
}

function getIconURLSync(app) {
    var iconPath = paths.APPICONS_DIR + '/' + app.id + '.png';
    return fs.existsSync(iconPath) ? '/api/v1/apps/' + app.id + '/icon' : null;
}

function get(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.icon = getIconURLSync(app);
        app.fqdn = config.appFqdn(app.location);

        callback(null, app);
    });
}

function getBySubdomain(subdomain, callback) {
    assert(typeof subdomain === 'string');
    assert(typeof callback === 'function');

    appdb.getBySubdomain(subdomain, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.icon = getIconURLSync(app);
        app.fqdn = config.appFqdn(app.location);

        callback(null, app);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    appdb.getAll(function (error, apps) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        apps.forEach(function (app) {
            app.icon = getIconURLSync(app);
            app.fqdn = config.appFqdn(app.location);
        });

        callback(null, apps);
    });
}

function validateAccessRestriction(accessRestriction) {
    // TODO: make the values below enumerations in the oauth code
    switch (accessRestriction) {
    case '':
    case 'roleUser':
    case 'roleAdmin':
        return null;
    default:
        return new Error('Invalid accessRestriction');
    }
}

function install(appId, appStoreId, version, location, portBindings, accessRestriction, callback) {
    assert(typeof appId === 'string');
    assert(typeof appStoreId === 'string');
    assert(typeof version === 'string');
    assert(typeof location === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof accessRestriction === 'string');
    assert(typeof callback === 'function');

    if (!semver.valid(version)) return callback(new AppsError(AppsError.BAD_FIELD, 'version is not valid semver'));

    var error = validateHostname(location, config.fqdn());
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validatePortBindings(portBindings);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validateAccessRestriction(accessRestriction);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    debug('Will install app with id : ' + appId);

    appdb.add(appId, appStoreId, version, location.toLowerCase(), portBindings, accessRestriction, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError(AppsError.ALREADY_EXISTS));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function configure(appId, location, portBindings, accessRestriction, callback) {
    assert(typeof appId === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof accessRestriction === 'string');
    assert(typeof callback === 'function');

    var error = location ? validateHostname(location, config.fqdn()) : null;
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = portBindings ? validatePortBindings(portBindings) : null;
    if (error) return callback(error);

    error = validateAccessRestriction(accessRestriction);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    var values = { };
    if (location) values.location = location.toLowerCase();
    values.portBindings = portBindings;
    values.accessRestriction = accessRestriction;

    debug('Will install app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_CONFIGURE, values, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function update(appId, version, callback) {
    assert(typeof appId === 'string');
    assert(typeof version === 'string');
    assert(typeof callback === 'function');

    debug('Will update app with id:%s', appId);

    if (!semver.valid(version)) return callback(new AppsError(AppsError.BAD_FIELD, 'version is not valid semver'));

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UPDATE, { version: version }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function getLogStream(appId, options, callback) {
    assert(typeof appId === 'string');
    assert(typeof options === 'object');
    assert(typeof callback === 'function');

    debug('Getting logs for %s', appId);
    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, 'App not installed'));

        var container = docker.getContainer(app.containerId);
        // note: cannot access docker file directly because it needs root access
        container.logs({ stdout: true, stderr: true, follow: true, timestamps: true, tail: 'all' }, function (error, logStream) {
            if (error && error.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            var lineCount = 0;
            var skipLinesStream = split(function mapper(line) {
                if (++lineCount < options.fromLine) return undefined;
                return JSON.stringify({ lineNumber: lineCount, log: line });
            });
            skipLinesStream.close = logStream.req.abort;
            logStream.pipe(skipLinesStream);
            return callback(null, skipLinesStream);
        });
    });
}

function getLogs(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Getting logs for %s', appId);
    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, 'App not installed'));

        var container = docker.getContainer(app.containerId);
        // note: cannot access docker file directly because it needs root access
        container.logs({ stdout: true, stderr: true, follow: false, timestamps: true, tail: 'all' }, function (error, logStream) {
            if (error && error.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            return callback(null, logStream);
        });
    });
}

function uninstall(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will uninstall app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UNINSTALL, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function start(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will start app with id:%s', appId);

    appdb.setRunCommand(appId, appdb.RSTATE_PENDING_START, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function stop(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will stop app with id:%s', appId);

    appdb.setRunCommand(appId, appdb.RSTATE_PENDING_STOP, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

