/* jslint node:true */

'use strict';

// intentionally here because of circular dep between apps.js, updater.js and cloudron.js
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
    restore: restore,
    update: update,

    getLogStream: getLogStream,
    getLogs: getLogs,

    start: start,
    stop: stop,

    exec: exec,

    checkManifestConstraints: checkManifestConstraints,

    setLastBackupId: setLastBackupId,

    // exported for testing
    _validateHostname: validateHostname,
    _validatePortBindings: validatePortBindings
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    child_process = require('child_process'),
    config = require('../config.js'),
    constants = require('../constants.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apps'),
    docker = require('./docker.js'),
    updater = require('./updater.js'),
    fs = require('fs'),
    manifestFormat = require('manifestformat'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    split = require('split'),
    util = require('util'),
    ts = require('tail-stream'),
    validator = require('validator');

var gTasks = { };

function initialize(callback) {
    assert(typeof callback === 'function');

    resume(callback); // TODO: potential race here since resume is async
}

function startTask(appId, maxDelay) {
    assert(typeof appId === 'string');
    assert(!maxDelay || typeof maxDelay === 'number');
    assert(!(appId in gTasks));

    maxDelay = maxDelay || 0;

    // start processes with an arbitrary delay to mitigate docker issue
    // https://github.com/docker/docker/issues/8714. this could be our bug as well
    // because we getFreePort in apptask has a race with multiprocess
    setTimeout(function () {
        gTasks[appId] = child_process.fork(__dirname + '/apptask.js', [ appId ]);
        gTasks[appId].once('exit', function (code, signal) {
            debug('Task completed :' + appId);
            delete gTasks[appId];
        });
    }, Math.floor(Math.random() * maxDelay));
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
            debug('Creating process for %s (%s) with state %s', app.location, app.id, app.installationState);
            startTask(app.id, apps.length);
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
AppsError.PORT_RESERVED = 'Port Reserved';
AppsError.PORT_CONFLICT = 'Port Conflict';

// Hostname validation comes from RFC 1123 (section 2.1)
// Domain name validation comes from RFC 2181 (Name syntax)
// https://en.wikipedia.org/wiki/Hostname#Restrictions_on_valid_host_names
// We are validating the validity of the location-fqdn as host name
function validateHostname(location, fqdn) {
    var RESERVED_LOCATIONS = [ constants.ADMIN_LOCATION ];

    if (RESERVED_LOCATIONS.indexOf(location) !== -1) return new Error(location + ' is reserved');

    if ((location.length + 1 + /* hyphen */ + fqdn.indexOf('.')) > 63) return new Error('Hostname length cannot be greater than 63');
    if (location.match(/^[A-Za-z0-9-]+$/) === null) return new Error('Hostname can only contain alphanumerics and hyphen');
    if (location[0] === '-' || location[location.length-1] === '-') return new Error('Hostname cannot start or end with hyphen');
    if (location.length + 1 /* hyphen */ + fqdn.length > 253) return new Error('FQDN length exceeds 253 characters');

    return null;
}

// validate the port bindings
function validatePortBindings(portBindings, tcpPorts) {
    // keep the public ports in sync with firewall rules in scripts/initializeBaseUbuntuImage.sh
    // these ports are reserved even if we listen only on 127.0.0.1 because we setup HostIp to be 127.0.0.1
    // for custom tcp ports
    var RESERVED_PORTS = [
        22, /* ssh */
        25, /* smtp */
        53, /* dns */
        80, /* http */
        443, /* https */
        2003, /* graphite (lo) */
        2004, /* graphite (lo) */
        2020, /* install server */
        3000, /* app server (lo) */
        3306, /* mysql (lo) */
        8000 /* graphite (lo) */
    ];

    if (!portBindings) return null;

    for (var env in portBindings) {
        if (!/^[a-zA-Z0-9_]+$/.test(env)) return new AppsError(AppsError.BAD_FIELD, env + ' is not valid environment variable');

        if (!Number.isInteger(portBindings[env])) return new Error(portBindings[env] + ' is not an integer');
        if (portBindings[env] <= 0 || portBindings[env] > 65535) return new Error(portBindings[env] + ' is out of range');

        if (RESERVED_PORTS.indexOf(portBindings[env]) !== -1) return new AppsError(AppsError.PORT_RESERVED, + portBindings[env]);
    }

    // it is OK if there is no 1-1 mapping between values in manifest.tcpPorts and portBindings. missing values implies
    // that the user wants the service disabled
    tcpPorts = tcpPorts || { };
    for (var env in portBindings) {
        if (!(env in tcpPorts)) return new AppsError(AppsError.BAD_FIELD, 'Invalid portBindings ' + env);
    }

    return null;
}

function getDuplicateErrorDetails(location, portBindings, error) {
    assert(typeof location === 'string');
    assert(typeof portBindings === 'object');
    assert(error.reason === DatabaseError.ALREADY_EXISTS);

    var match = error.message.match(/ER_DUP_ENTRY: Duplicate entry '(.*)' for key/);
    if (!match) {
        console.error('Unexpected SQL error message.', error);
        return new AppsError(AppsError.INTERNAL_ERROR);
    }

    // check if the location conflicts
    if (match[1] === location) return new AppsError(AppsError.ALREADY_EXISTS);

    // check if any of the port bindings conflict
    for (var env in portBindings) {
        if (portBindings[env] === parseInt(match[1])) return new AppsError(AppsError.PORT_CONFLICT, match[1]);
    }

    return new AppsError(AppsError.ALREADY_EXISTS);
}

function getIconUrlSync(app) {
    var iconPath = paths.APPICONS_DIR + '/' + app.id + '.png';
    return fs.existsSync(iconPath) ? '/api/v1/apps/' + app.id + '/icon' : null;
}

function get(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.iconUrl = getIconUrlSync(app);
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

        app.iconUrl = getIconUrlSync(app);
        app.fqdn = config.appFqdn(app.location);

        callback(null, app);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    var updates = updater.getUpdateInfo().apps || [];

    appdb.getAll(function (error, apps) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        apps.forEach(function (app) {
            app.iconUrl = getIconUrlSync(app);
            app.fqdn = config.appFqdn(app.location);
            app.updateVersion = updates[app.id] ? updates[app.id].manifest.version : null;
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

function install(appId, appStoreId, manifest, location, portBindings, accessRestriction, icon, callback) {
    assert(typeof appId === 'string');
    assert(typeof appStoreId === 'string');
    assert(manifest && typeof manifest === 'object');
    assert(typeof location === 'string');
    assert(!portBindings || typeof portBindings === 'object');
    assert(typeof accessRestriction === 'string');
    assert(!icon || typeof icon === 'string');
    assert(typeof callback === 'function');

    var error = manifestFormat.parse(manifest);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, 'Manifest error: ' + error.message));

    error = checkManifestConstraints(manifest);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, 'Manifest cannot be installed: ' + error.message));

    error = validateHostname(location, config.fqdn());
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validatePortBindings(portBindings, manifest.tcpPorts);
    if (error) return callback(error);

    error = validateAccessRestriction(accessRestriction);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    if (icon) {
        if (!validator.isBase64(icon)) return callback(new AppsError(AppsError.BAD_FIELD, 'icon is not base64'));

        if (!safe.fs.writeFileSync(path.join(paths.APPICONS_DIR, appId + '.png'), new Buffer(icon, 'base64'))) {
            return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving icon:' + safe.error.message));
        }
    }

   debug('Will install app with id : ' + appId);

    appdb.add(appId, appStoreId, manifest, location.toLowerCase(), portBindings, accessRestriction, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(getDuplicateErrorDetails(location.toLowerCase(), portBindings, error));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId);
        startTask(appId);

        callback(null);
    });
}

function configure(appId, location, portBindings, accessRestriction, callback) {
    assert(typeof appId === 'string');
    assert(typeof location === 'string');
    assert(typeof portBindings === 'object');
    assert(typeof accessRestriction === 'string');
    assert(typeof callback === 'function');

    var error = validateHostname(location, config.fqdn());
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validateAccessRestriction(accessRestriction);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        error = validatePortBindings(portBindings, app.manifest.tcpPorts);
        if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

        var values = {
            location: location.toLowerCase(),
            accessRestriction: accessRestriction,
            portBindings: portBindings
        };

        debug('Will configure app with id:%s values:%j', appId, values);

        appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_CONFIGURE, values, function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(getDuplicateErrorDetails(location.toLowerCase(), portBindings, error));
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            startTask(appId);

            callback(null);
        });
    });
}

function update(appId, manifest, portBindings, icon, callback) {
    assert(typeof appId === 'string');
    assert(manifest && typeof manifest === 'object');
    assert(!portBindings || typeof portBindings === 'object');
    assert(!icon || typeof icon === 'string');
    assert(typeof callback === 'function');

    debug('Will update app with id:%s', appId);

    var error = manifestFormat.parse(manifest);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, 'Manifest error:' + error.message));

    error = checkManifestConstraints(manifest);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, 'Manifest cannot be installed:' + error.message));

    error = validatePortBindings(portBindings, manifest.tcpPorts);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    if (icon) {
        if (!validator.isBase64(icon)) return callback(new AppsError(AppsError.BAD_FIELD, 'icon is not base64'));

        if (!safe.fs.writeFileSync(path.join(paths.APPICONS_DIR, appId + '.png'), new Buffer(icon, 'base64'))) {
            return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving icon:' + safe.error.message));
        }
    }

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UPDATE, { manifest: manifest, portBindings: portBindings }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        startTask(appId);

        callback(null);
    });
}

function getLogStream(appId, fromLine, callback) {
    assert(typeof appId === 'string');
    assert(typeof fromLine === 'number'); // behaves like tail -n
    assert(typeof callback === 'function');

    debug('Getting logs for %s', appId);
    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, util.format('App is in %s state.', app.installationState)));

        var container = docker.getContainer(app.containerId);
        var tail = fromLine < 0 ? -fromLine : 'all';

        // note: cannot access docker file directly because it needs root access
        container.logs({ stdout: true, stderr: true, follow: true, timestamps: true, tail: tail }, function (error, logStream) {
            if (error && error.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            var lineCount = 0;
            var skipLinesStream = split(function mapper(line) {
                if (++lineCount < fromLine) return undefined;
                var timestamp = line.substr(0, line.indexOf(' ')); // sometimes this has square brackets around it
                return JSON.stringify({ lineNumber: lineCount, timestamp: timestamp.replace(/[[\]]/g,''), log: line.substr(timestamp.length + 1) });
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

        if (app.installationState !== appdb.ISTATE_INSTALLED) return callback(new AppsError(AppsError.BAD_STATE, util.format('App is in %s state.', app.installationState)));

        var container = docker.getContainer(app.containerId);
        // note: cannot access docker file directly because it needs root access
        container.logs({ stdout: true, stderr: true, follow: false, timestamps: true, tail: 'all' }, function (error, logStream) {
            if (error && error.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            return callback(null, logStream);
        });
    });
}

function restore(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will restore app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_RESTORE, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        startTask(appId);

        callback(null);
    });
}

function uninstall(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('Will uninstall app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UNINSTALL, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        stopTask(appId); // since uninstall is allowed from any state, kill current task
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

function checkManifestConstraints(manifest) {
    if (semver.valid(manifest.maxBoxVersion) && semver.gt(config.version(), manifest.maxBoxVersion)) {
        return new Error('Box version exceeds Apps maxBoxVersion');
    }

    if (semver.valid(manifest.minBoxVersion) && semver.gt(manifest.minBoxVersion, config.version())) {
        return new Error('minBoxVersion exceeds Box version');
    }

    return null;
}

function exec(appId, options, callback) {
    assert(typeof appId === 'string');
    assert(options && typeof options === 'object');
    assert(typeof callback === 'function');

    var cmd = options.cmd || [ '/bin/bash' ];
    assert(util.isArray(cmd) && cmd.length > 0);

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        var container = docker.getContainer(app.containerId);

        if (options.rows && options.columns) {
            container.resize({ h: options.rows, w: options.columns }, function (error) { if (error) debug('Error resizing console', error); });
        }

        var execOptions = {
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            Cmd: cmd
        };

        container.exec(execOptions, function (error, exec) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));
            var startOptions = {
                Detach: false,
                Tty: true,
                stdin: true // this is a dockerode option that enabled openStdin in the modem
            };
            exec.start(startOptions, function(error, stream) {
                if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

                return callback(null, stream);
            });
        });
    });
}

function setLastBackupId(appId, lastBackupId, callback) {
    assert(typeof appId === 'string');
    assert(typeof lastBackupId === 'string');
    assert(typeof callback === 'function');

    appdb.update(appId, { lastBackupId: lastBackupId }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

