/* jslint node:true */

'use strict';

exports = module.exports = {
    AppsError: AppsError,

    get: get,
    getBySubdomain: getBySubdomain,
    getAll: getAll,
    purchase: purchase,
    install: install,
    configure: configure,
    uninstall: uninstall,

    restore: restore,
    restoreApp: restoreApp,

    update: update,

    backup: backup,
    backupApp: backupApp,

    getLogStream: getLogStream,
    getLogs: getLogs,

    start: start,
    stop: stop,

    exec: exec,

    checkManifestConstraints: checkManifestConstraints,

    setRestorePoint: setRestorePoint,

    autoupdateApps: autoupdateApps,

    // exported for testing
    _validateHostname: validateHostname,
    _validatePortBindings: validatePortBindings
};

var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    backups = require('./backups.js'),
    BackupsError = require('./backups.js').BackupsError,
    config = require('./config.js'),
    constants = require('./constants.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apps'),
    docker = require('./docker.js'),
    fs = require('fs'),
    manifestFormat = require('cloudron-manifestformat'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    shell = require('./shell.js'),
    split = require('split'),
    superagent = require('superagent'),
    taskmanager = require('./taskmanager.js'),
    util = require('util'),
    validator = require('validator');

var BACKUP_APP_CMD = path.join(__dirname, 'scripts/backupapp.sh'),
    RESTORE_APP_CMD = path.join(__dirname, 'scripts/restoreapp.sh'),
    BACKUP_SWAP_CMD = path.join(__dirname, 'scripts/backupswap.sh');

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? app.location : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

function ignoreError(func) {
    return function (callback) {
        func(function (error) {
            if (error) console.error('Ignored error:', error);
            callback();
        });
    };
}

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AppsError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
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
AppsError.EXTERNAL_ERROR = 'External Error';
AppsError.ALREADY_EXISTS = 'Already Exists';
AppsError.NOT_FOUND = 'Not Found';
AppsError.BAD_FIELD = 'Bad Field';
AppsError.BAD_STATE = 'Bad State';
AppsError.PORT_RESERVED = 'Port Reserved';
AppsError.PORT_CONFLICT = 'Port Conflict';
AppsError.BILLING_REQUIRED = 'Billing Required';

// Hostname validation comes from RFC 1123 (section 2.1)
// Domain name validation comes from RFC 2181 (Name syntax)
// https://en.wikipedia.org/wiki/Hostname#Restrictions_on_valid_host_names
// We are validating the validity of the location-fqdn as host name
function validateHostname(location, fqdn) {
    var RESERVED_LOCATIONS = [ constants.ADMIN_LOCATION, constants.API_LOCATION ];

    if (RESERVED_LOCATIONS.indexOf(location) !== -1) return new Error(location + ' is reserved');

    if (location === '') return null; // bare location

    if ((location.length + 1 /*+ hyphen */ + fqdn.indexOf('.')) > 63) return new Error('Hostname length cannot be greater than 63');
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
        config.get('port'), /* app server (lo) */
        config.get('internalPort'), /* internal app server (lo) */
        3306, /* mysql (lo) */
        8000 /* graphite (lo) */
    ];

    if (!portBindings) return null;

    var env;
    for (env in portBindings) {
        if (!/^[a-zA-Z0-9_]+$/.test(env)) return new AppsError(AppsError.BAD_FIELD, env + ' is not valid environment variable');

        if (!Number.isInteger(portBindings[env])) return new Error(portBindings[env] + ' is not an integer');
        if (portBindings[env] <= 0 || portBindings[env] > 65535) return new Error(portBindings[env] + ' is out of range');

        if (RESERVED_PORTS.indexOf(portBindings[env]) !== -1) return new AppsError(AppsError.PORT_RESERVED, + portBindings[env]);
    }

    // it is OK if there is no 1-1 mapping between values in manifest.tcpPorts and portBindings. missing values implies
    // that the user wants the service disabled
    tcpPorts = tcpPorts || { };
    for (env in portBindings) {
        if (!(env in tcpPorts)) return new AppsError(AppsError.BAD_FIELD, 'Invalid portBindings ' + env);
    }

    return null;
}

function getDuplicateErrorDetails(location, portBindings, error) {
    assert.strictEqual(typeof location, 'string');
    assert.strictEqual(typeof portBindings, 'object');
    assert.strictEqual(error.reason, DatabaseError.ALREADY_EXISTS);

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
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.iconUrl = getIconUrlSync(app);
        app.fqdn = config.appFqdn(app.location);

        callback(null, app);
    });
}

function getBySubdomain(subdomain, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof callback, 'function');

    appdb.getBySubdomain(subdomain, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        app.iconUrl = getIconUrlSync(app);
        app.fqdn = config.appFqdn(app.location);

        callback(null, app);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    appdb.getAll(function (error, apps) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        apps.forEach(function (app) {
            app.iconUrl = getIconUrlSync(app);
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

function purchase(appStoreId, callback) {
    assert.strictEqual(typeof appStoreId, 'string');
    assert.strictEqual(typeof callback, 'function');

    // Skip purchase if appStoreId is empty
    if (appStoreId === '') return callback(null);

    var url = config.apiServerOrigin() + '/api/v1/apps/' + appStoreId + '/purchase';

    superagent.post(url).query({ token: config.token() }).end(function (error, res) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));
        if (res.status === 402) return callback(new AppsError(AppsError.BILLING_REQUIRED));
        if (res.status !== 201 && res.status !== 200) return callback(new Error(util.format('App purchase failed. %s %j', res.status, res.body)));

        callback(null);
    });
}

function install(appId, appStoreId, manifest, location, portBindings, accessRestriction, icon, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof appStoreId, 'string');
    assert(manifest && typeof manifest === 'object');
    assert.strictEqual(typeof location, 'string');
    assert.strictEqual(typeof portBindings, 'object');
    assert.strictEqual(typeof accessRestriction, 'string');
    assert(!icon || typeof icon === 'string');
    assert.strictEqual(typeof callback, 'function');

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

    purchase(appStoreId, function (error) {
        if (error) return callback(error);

        appdb.add(appId, appStoreId, manifest, location.toLowerCase(), portBindings, accessRestriction, function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(getDuplicateErrorDetails(location.toLowerCase(), portBindings, error));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function configure(appId, location, portBindings, accessRestriction, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof location, 'string');
    assert.strictEqual(typeof portBindings, 'object');
    assert.strictEqual(typeof accessRestriction, 'string');
    assert.strictEqual(typeof callback, 'function');

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
            portBindings: portBindings,

            oldConfig: {
                location: app.location,
                accessRestriction: app.accessRestriction,
                portBindings: app.portBindings
            }
        };

        debug('Will configure app with id:%s values:%j', appId, values);

        appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_CONFIGURE, values, function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(getDuplicateErrorDetails(location.toLowerCase(), portBindings, error));
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function update(appId, force, manifest, portBindings, icon, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof force, 'boolean');
    assert(manifest && typeof manifest === 'object');
    assert(!portBindings || typeof portBindings === 'object');
    assert(!icon || typeof icon === 'string');
    assert.strictEqual(typeof callback, 'function');

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

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        var values = {
            manifest: manifest,
            portBindings: portBindings,
            oldConfig: {
                manifest: app.manifest,
                portBindings: app.portBindings
            }
        };

        appdb.setInstallationCommand(appId, force ? appdb.ISTATE_PENDING_FORCE_UPDATE : appdb.ISTATE_PENDING_UPDATE, values, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(getDuplicateErrorDetails('' /* location cannot conflict */, portBindings, error));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function getLogStream(appId, fromLine, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof fromLine, 'number'); // behaves like tail -n
    assert.strictEqual(typeof callback, 'function');

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
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

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
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('Will restore app with id:%s', appId);

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        var restoreConfig = app.lastBackupConfig;
        if (!restoreConfig) return callback(new AppsError(AppsError.BAD_STATE, 'No restore point'));

        // re-validate because this new box version may not accept old configs. if we restore location, it should be validated here as well
        error = checkManifestConstraints(restoreConfig.manifest);
        if (error) return callback(new AppsError(AppsError.BAD_FIELD, 'Manifest cannot be installed: ' + error.message));

        error = validatePortBindings(restoreConfig.portBindings, restoreConfig.manifest.tcpPorts); // maybe new ports got reserved now
        if (error) return callback(error);

        // ## should probably query new location, access restriction from user
        var values = {
            manifest: restoreConfig.manifest,
            portBindings: restoreConfig.portBindings,

            oldConfig: {
                location: app.location,
                accessRestriction: app.accessRestriction,
                portBindings: app.portBindings,
                manifest: app.manifest
            }
        };

        appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_RESTORE, values, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function uninstall(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('Will uninstall app with id:%s', appId);

    appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UNINSTALL, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        taskmanager.restartAppTask(appId); // since uninstall is allowed from any state, kill current task

        callback(null);
    });
}

function start(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('Will start app with id:%s', appId);

    appdb.setRunCommand(appId, appdb.RSTATE_PENDING_START, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        taskmanager.restartAppTask(appId);

        callback(null);
    });
}

function stop(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('Will stop app with id:%s', appId);

    appdb.setRunCommand(appId, appdb.RSTATE_PENDING_STOP, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        taskmanager.restartAppTask(appId);

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
    assert.strictEqual(typeof appId, 'string');
    assert(options && typeof options === 'object');
    assert.strictEqual(typeof callback, 'function');

    var cmd = options.cmd || [ '/bin/bash' ];
    assert(util.isArray(cmd) && cmd.length > 0);

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        var container = docker.getContainer(app.containerId);

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

                if (options.rows && options.columns) {
                    exec.resize({ h: options.rows, w: options.columns }, function (error) { if (error) debug('Error resizing console', error); });
                }

                return callback(null, stream);
            });
        });
    });
}

function setRestorePoint(appId, lastBackupId, lastBackupConfig, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof lastBackupId, 'string');
    assert.strictEqual(typeof lastBackupConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    appdb.update(appId, { lastBackupId: lastBackupId, lastBackupConfig: lastBackupConfig }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function autoupdateApps(updateInfo, callback) { // updateInfo is { appId -> { manifest } }
    assert.strictEqual(typeof updateInfo, 'object');
    assert.strictEqual(typeof callback, 'function');

    function canAutoupdateApp(app, newManifest) {
        // TODO: maybe check the description as well?
        if (!newManifest.tcpPorts && !app.portBindings) return true;
        if (!newManifest.tcpPorts || !app.portBindings) return false;

        for (var env in newManifest.tcpPorts) {
            if (!(env in app.portBindings)) return false;
       }

        return true;
    }

    if (!updateInfo) return callback(null);

    async.eachSeries(Object.keys(updateInfo), function iterator(appId, iteratorDone) {
        get(appId, function (error, app) {
            if (!canAutoupdateApp(app, updateInfo[appId].manifest)) {
                return iteratorDone();
            }

           update(appId, updateInfo[appId].manifest, app.portBindings, null /* icon */, function (error) {
                if (error) debug('Error initiating autoupdate of %s', appId);

                iteratorDone(null);
            });
        });
    }, callback);
}

function backupApp(app, addonsToBackup, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof addonsToBackup, 'object');
    assert.strictEqual(typeof callback, 'function');

    function canBackupApp(app) {
        // only backup apps that are installed or pending configure. Rest of them are in some
        // state not good for consistent backup (i.e addons may not have been setup completely)
        return (app.installationState === appdb.ISTATE_INSTALLED && app.health === appdb.HEALTH_HEALTHY)
                || app.installationState === appdb.ISTATE_PENDING_CONFIGURE
                || app.installationState === appdb.ISTATE_PENDING_BACKUP
                || app.installationState === appdb.ISTATE_PENDING_UPDATE; // called from apptask
    }

    if (!canBackupApp(app)) return callback(new AppsError(AppsError.BAD_STATE, 'App not healthy'));

    var appConfig = {
        manifest: app.manifest,
        location: app.location,
        portBindings: app.portBindings,
        accessRestriction: app.accessRestriction
    };

    if (!safe.fs.writeFileSync(path.join(paths.DATA_DIR, app.id + '/config.json'), JSON.stringify(appConfig), 'utf8')) {
        return callback(safe.error);
    }

    backups.getBackupUrl(app, null, function (error, result) {
        if (error && error.reason === BackupsError.EXTERNAL_ERROR) return callback(new AppsError(AppsError.EXTERNAL_ERROR, error.message));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debugApp(app, 'backupApp: backup url:%s backup id:%s', result.url, result.id);

        async.series([
            ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
            addons.backupAddons.bind(null, app, addonsToBackup),
            shell.sudo.bind(null, 'backupApp', [ BACKUP_APP_CMD,  app.id, result.url, result.backupKey ]),
            ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
        ], function (error) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            debugApp(app, 'backupApp: successful id:%s', result.id);

            setRestorePoint(app.id, result.id, appConfig, function (error) {
                if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

                return callback(null, result.id);
            });
        });
    });
}

function backup(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    get(appId, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_BACKUP, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function restoreApp(app, addonsToRestore, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof addonsToRestore, 'object');
    assert.strictEqual(typeof callback, 'function');
    assert(app.lastBackupId);

    backups.getRestoreUrl(app.lastBackupId, function (error, result) {
        if (error && error.reason == BackupsError.EXTERNAL_ERROR) return callback(new AppsError(AppsError.EXTERNAL_ERROR, error.message));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debugApp(app, 'restoreApp: restoreUrl:%s', result.url);

        shell.sudo('restoreApp', [ RESTORE_APP_CMD,  app.id, result.url, result.backupKey ], function (error) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            addons.restoreAddons(app, addonsToRestore, callback);
        });
    });
}

