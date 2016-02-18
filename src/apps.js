/* jslint node:true */

'use strict';

exports = module.exports = {
    AppsError: AppsError,

    hasAccessTo: hasAccessTo,

    get: get,
    getBySubdomain: getBySubdomain,
    getByIpAddress: getByIpAddress,
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
    listBackups: listBackups,

    getLogs: getLogs,

    start: start,
    stop: stop,

    exec: exec,

    checkManifestConstraints: checkManifestConstraints,

    setRestorePoint: setRestorePoint,

    autoupdateApps: autoupdateApps,

    // exported for testing
    _validateHostname: validateHostname,
    _validatePortBindings: validatePortBindings,
    _validateAccessRestriction: validateAccessRestriction
};

var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    backups = require('./backups.js'),
    BackupsError = require('./backups.js').BackupsError,
    certificates = require('./certificates.js'),
    config = require('./config.js'),
    constants = require('./constants.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:apps'),
    docker = require('./docker.js'),
    fs = require('fs'),
    groups = require('./groups.js'),
    manifestFormat = require('cloudron-manifestformat'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    shell = require('./shell.js'),
    spawn = require('child_process').spawn,
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
AppsError.ACCESS_DENIED = 'Access denied';
AppsError.USER_REQUIRED = 'User required';
AppsError.BAD_CERTIFICATE = 'Invalid certificate';

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
        25, /* smtp */
        53, /* dns */
        80, /* http */
        443, /* https */
        919, /* ssh */
        2003, /* graphite (lo) */
        2004, /* graphite (lo) */
        2020, /* install server */
        config.get('port'), /* app server (lo) */
        config.get('internalPort'), /* internal app server (lo) */
        config.get('ldapPort'), /* ldap server (lo) */
        config.get('oauthProxyPort'), /* oauth proxy server (lo) */
        config.get('simpleAuthPort'), /* simple auth server (lo) */
        3306, /* mysql (lo) */
        8000 /* graphite (lo) */
    ];

    if (!portBindings) return null;

    var env;
    for (env in portBindings) {
        if (!/^[a-zA-Z0-9_]+$/.test(env)) return new AppsError(AppsError.BAD_FIELD, env + ' is not valid environment variable');

        if (!Number.isInteger(portBindings[env])) return new Error(portBindings[env] + ' is not an integer');
        if (portBindings[env] <= 0 || portBindings[env] > 65535) return new Error(portBindings[env] + ' is out of range');

        if (RESERVED_PORTS.indexOf(portBindings[env]) !== -1) return new AppsError(AppsError.PORT_RESERVED, String(portBindings[env]));
    }

    // it is OK if there is no 1-1 mapping between values in manifest.tcpPorts and portBindings. missing values implies
    // that the user wants the service disabled
    tcpPorts = tcpPorts || { };
    for (env in portBindings) {
        if (!(env in tcpPorts)) return new AppsError(AppsError.BAD_FIELD, 'Invalid portBindings ' + env);
    }

    return null;
}

function validateAccessRestriction(accessRestriction) {
    assert.strictEqual(typeof accessRestriction, 'object');

    if (accessRestriction === null) return null;

    var noUsers = true, noGroups = true;

    if (accessRestriction.users) {
        if (!Array.isArray(accessRestriction.users)) return new Error('users array property required');
        if (!accessRestriction.users.every(function (e) { return typeof e === 'string'; })) return new Error('All users have to be strings');
        noUsers = accessRestriction.users.length === 0;
    }

    if (accessRestriction.groups) {
        if (!Array.isArray(accessRestriction.groups)) return new Error('groups array property required');
        if (!accessRestriction.groups.every(function (e) { return typeof e === 'string'; })) return new Error('All groups have to be strings');
        noGroups = accessRestriction.groups.length === 0;
    }

    if (noUsers && noGroups) return new Error('users and groups array cannot both be empty');

    return null;
}

function validateMemoryLimit(manifest, memoryLimit) {
    assert.strictEqual(typeof manifest, 'object');
    assert.strictEqual(typeof memoryLimit, 'number');

    var min = manifest.memoryLimit || constants.DEFAULT_MEMORY_LIMIT;
    var max = (4096 * 1024 * 1024);

    // allow 0, which indicates that it is not set, the one from the manifest will be choosen but we don't commit any user value
    // this is needed so an app update can change the value in the manifest, and if not set by the user, the new value should be used
    if (memoryLimit === 0) return null;

    if (memoryLimit < min) return new Error('memoryLimit too small');
    if (memoryLimit > max) return new Error('memoryLimit too large');

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

function hasAccessTo(app, user, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (app.accessRestriction === null) return callback(null, true);

    // check user access
    if (app.accessRestriction.users.some(function (e) { return e === user.id; })) return callback(null, true);

    // check group access
    if (!app.accessRestriction.groups) return callback(null, false);

    async.some(app.accessRestriction.groups, function (groupId, iteratorDone) {
        groups.isMember(groupId, user.id, function (error, member) {
            iteratorDone(!error && member); // async.some does not take error argument in callback
        });
    }, function (result) {
        callback(null, result);
    });
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

function getByIpAddress(ip, callback) {
    assert.strictEqual(typeof ip, 'string');
    assert.strictEqual(typeof callback, 'function');

    docker.getContainerIdByIp(ip, function (error, containerId) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        appdb.getByContainerId(containerId, function (error, app) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            app.iconUrl = getIconUrlSync(app);
            app.fqdn = config.appFqdn(app.location);

            callback(null, app);
        });
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

function purchase(appStoreId, callback) {
    assert.strictEqual(typeof appStoreId, 'string');
    assert.strictEqual(typeof callback, 'function');

    // Skip purchase if appStoreId is empty
    if (appStoreId === '') return callback(null);

    // Skip if we don't have an appstore token
    if (config.token() === '') return callback(null);

    var url = config.apiServerOrigin() + '/api/v1/apps/' + appStoreId + '/purchase';

    superagent.post(url).query({ token: config.token() }).end(function (error, res) {
        if (error && !error.response) return callback(new AppsError(AppsError.EXTERNAL_ERROR, error));
        if (res.statusCode === 402) return callback(new AppsError(AppsError.BILLING_REQUIRED));
        if (res.statusCode === 404) return callback(new AppsError(AppsError.NOT_FOUND));
        if (res.statusCode !== 201 && res.statusCode !== 200) return callback(new Error(util.format('App purchase failed. %s %j', res.status, res.body)));

        callback(null);
    });
}

function install(appId, appStoreId, manifest, location, portBindings, accessRestriction, oauthProxy, icon, cert, key, memoryLimit, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof appStoreId, 'string');
    assert(manifest && typeof manifest === 'object');
    assert.strictEqual(typeof location, 'string');
    assert.strictEqual(typeof portBindings, 'object');
    assert.strictEqual(typeof accessRestriction, 'object');
    assert.strictEqual(typeof oauthProxy, 'boolean');
    assert(!icon || typeof icon === 'string');
    assert(cert === null || typeof cert === 'string');
    assert(key === null || typeof key === 'string');
    assert.strictEqual(typeof memoryLimit, 'number');
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

    error = validateMemoryLimit(manifest, memoryLimit);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    // memoryLimit might come in as 0 if not specified
    memoryLimit = memoryLimit || manifest.memoryLimit || constants.DEFAULT_MEMORY_LIMIT;

    // singleUser mode requires accessRestriction to contain exactly one user
    if (manifest.singleUser && accessRestriction === null) return callback(new AppsError(AppsError.USER_REQUIRED));
    if (manifest.singleUser && accessRestriction.users.length !== 1) return callback(new AppsError(AppsError.USER_REQUIRED));

    if (icon) {
        if (!validator.isBase64(icon)) return callback(new AppsError(AppsError.BAD_FIELD, 'icon is not base64'));

        if (!safe.fs.writeFileSync(path.join(paths.APPICONS_DIR, appId + '.png'), new Buffer(icon, 'base64'))) {
            return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving icon:' + safe.error.message));
        }
    }

    error = certificates.validateCertificate(cert, key, config.appFqdn(location));
    if (error) return callback(new AppsError(AppsError.BAD_CERTIFICATE, error.message));

    debug('Will install app with id : ' + appId);

    purchase(appStoreId, function (error) {
        if (error) return callback(error);

        appdb.add(appId, appStoreId, manifest, location.toLowerCase(), portBindings, accessRestriction, oauthProxy, memoryLimit, function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(getDuplicateErrorDetails(location.toLowerCase(), portBindings, error));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            // save cert to data/box/certs
            if (cert && key) {
                if (!safe.fs.writeFileSync(path.join(paths.APP_CERTS_DIR, config.appFqdn(location) + '.cert'), cert)) return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving cert: ' + safe.error.message));
                if (!safe.fs.writeFileSync(path.join(paths.APP_CERTS_DIR, config.appFqdn(location) + '.key'), key)) return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving key: ' + safe.error.message));
            }

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function configure(appId, location, portBindings, accessRestriction, oauthProxy, cert, key, memoryLimit, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof location, 'string');
    assert.strictEqual(typeof portBindings, 'object');
    assert.strictEqual(typeof accessRestriction, 'object');
    assert.strictEqual(typeof oauthProxy, 'boolean');
    assert(cert === null || typeof cert === 'string');
    assert(key === null || typeof key === 'string');
    assert.strictEqual(typeof memoryLimit, 'number');
    assert.strictEqual(typeof callback, 'function');

    var error = validateHostname(location, config.fqdn());
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = validateAccessRestriction(accessRestriction);
    if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

    error = certificates.validateCertificate(cert, key, config.appFqdn(location));
    if (error) return callback(new AppsError(AppsError.BAD_CERTIFICATE, error.message));

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        error = validatePortBindings(portBindings, app.manifest.tcpPorts);
        if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

        error = validateMemoryLimit(app.manifest, memoryLimit);
        if (error) return callback(new AppsError(AppsError.BAD_FIELD, error.message));

        // memoryLimit might come in as 0 if not specified
        memoryLimit = memoryLimit || app.memoryLimit || app.manifest.memoryLimit || constants.DEFAULT_MEMORY_LIMIT;

        // save cert to data/box/certs
        if (cert && key) {
            if (!safe.fs.writeFileSync(path.join(paths.APP_CERTS_DIR, config.appFqdn(location) + '.cert'), cert)) return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving cert: ' + safe.error.message));
            if (!safe.fs.writeFileSync(path.join(paths.APP_CERTS_DIR, config.appFqdn(location) + '.key'), key)) return callback(new AppsError(AppsError.INTERNAL_ERROR, 'Error saving key: ' + safe.error.message));
        }

        var values = {
            location: location.toLowerCase(),
            accessRestriction: accessRestriction,
            oauthProxy: oauthProxy,
            portBindings: portBindings,
            memoryLimit: memoryLimit,

            oldConfig: {
                location: app.location,
                accessRestriction: app.accessRestriction,
                portBindings: app.portBindings,
                oauthProxy: app.oauthProxy,
                memoryLimit: app.memoryLimit
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

        // Ensure we update the memory limit in case the new app requires more memory as a minimum
        var memoryLimit = manifest.memoryLimit ? (app.memoryLimit < manifest.memoryLimit ? manifest.memoryLimit : app.memoryLimit) : app.memoryLimit;

        var values = {
            manifest: manifest,
            portBindings: portBindings,
            memoryLimit: memoryLimit,

            oldConfig: {
                manifest: app.manifest,
                portBindings: app.portBindings,
                accessRestriction: app.accessRestriction,
                oauthProxy: app.oauthProxy,
                memoryLimit: app.memoryLimit
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

function appLogFilter(app) {
    var names = [ app.id ].concat(addons.getContainerNamesSync(app, app.manifest.addons));

    return names.map(function (name) { return 'CONTAINER_NAME=' + name; });
}

function getLogs(appId, lines, follow, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof lines, 'number');
    assert.strictEqual(typeof follow, 'boolean');
    assert.strictEqual(typeof callback, 'function');

    debug('Getting logs for %s', appId);

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        var args = [ '--output=json', '--no-pager', '--lines=' + lines ];
        if (follow) args.push('--follow');
        args = args.concat(appLogFilter(app));

        var cp = spawn('/bin/journalctl', args);

        var transformStream = split(function mapper(line) {
            var obj = safe.JSON.parse(line);
            if (!obj) return undefined;

            var source = obj.CONTAINER_NAME.slice(app.id.length + 1);
            return JSON.stringify({
                realtimeTimestamp: obj.__REALTIME_TIMESTAMP,
                monotonicTimestamp: obj.__MONOTONIC_TIMESTAMP,
                message: obj.MESSAGE,
                source: source || 'main'
            }) + '\n';
        });

        transformStream.close = cp.kill.bind(cp, 'SIGKILL'); // closing stream kills the child process

        cp.stdout.pipe(transformStream);

        return callback(null, transformStream);
    });
}

function restore(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('Will restore app with id:%s', appId);

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        // restore without a backup is the same as re-install
        var restoreConfig = app.lastBackupConfig, values = { };
        if (restoreConfig) {
            // re-validate because this new box version may not accept old configs.
            // if we restore location, it should be validated here as well
            error = checkManifestConstraints(restoreConfig.manifest);
            if (error) return callback(new AppsError(AppsError.BAD_FIELD, 'Manifest cannot be installed: ' + error.message));

            error = validatePortBindings(restoreConfig.portBindings, restoreConfig.manifest.tcpPorts); // maybe new ports got reserved now
            if (error) return callback(error);

            // ## should probably query new location, access restriction from user
            values = {
                manifest: restoreConfig.manifest,
                portBindings: restoreConfig.portBindings,
                memoryLimit: restoreConfig.memoryLimit,

                oldConfig: {
                    location: app.location,
                    accessRestriction: app.accessRestriction,
                    oauthProxy: app.oauthProxy,
                    portBindings: app.portBindings,
                    memoryLimit: app.memoryLimit,
                    manifest: app.manifest
                }
            };
        }

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

    taskmanager.stopAppTask(appId, function () {
        appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_UNINSTALL, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.NOT_FOUND, 'No such app'));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.startAppTask(appId, callback);
        });
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
    if (!manifest.dockerImage) return new Error('Missing dockerImage'); // dockerImage is optional in manifest

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

        if (app.installationState !== appdb.ISTATE_INSTALLED || app.runState !== appdb.RSTATE_RUNNING) {
            return callback(new AppsError(AppsError.BAD_STATE, 'App not installed or running'));
        }

        var container = docker.connection.getContainer(app.containerId);

       var execOptions = {
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: options.tty,
            Cmd: cmd
        };

        container.exec(execOptions, function (error, exec) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));
            var startOptions = {
                Detach: false,
                Tty: options.tty,
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
        var tcpPorts = newManifest.tcpPorts || { };
        var portBindings = app.portBindings; // this is never null

        if (Object.keys(tcpPorts).length === 0 && Object.keys(portBindings).length === 0) return null;
        if (Object.keys(tcpPorts).length === 0) return new Error('tcpPorts is now empty but portBindings is not');
        if (Object.keys(portBindings).length === 0) return new Error('portBindings is now empty but tcpPorts is not');

        for (var env in tcpPorts) {
            if (!(env in portBindings)) return new Error(env + ' is required from user');
        }

        // it's fine if one or more keys got removed
        return null;
    }

    if (!updateInfo) return callback(null);

    async.eachSeries(Object.keys(updateInfo), function iterator(appId, iteratorDone) {
        get(appId, function (error, app) {
            if (error) {
                debug('Cannot autoupdate app %s : %s', appId, error.message);
                return iteratorDone();
           }

            error = canAutoupdateApp(app, updateInfo[appId].manifest);
            if (error) {
                debug('app %s requires manual update. %s', appId, error.message);
                return iteratorDone();
            }

           update(appId, false /* force */, updateInfo[appId].manifest, app.portBindings, null /* icon */, function (error) {
                if (error) debug('Error initiating autoupdate of %s. %s', appId, error.message);

                iteratorDone(null);
            });
        });
    }, callback);
}

function canBackupApp(app) {
    // only backup apps that are installed or pending configure or called from apptask. Rest of them are in some
    // state not good for consistent backup (i.e addons may not have been setup completely)
    return (app.installationState === appdb.ISTATE_INSTALLED && app.health === appdb.HEALTH_HEALTHY) ||
            app.installationState === appdb.ISTATE_PENDING_CONFIGURE ||
            app.installationState === appdb.ISTATE_PENDING_BACKUP ||  // called from apptask
            app.installationState === appdb.ISTATE_PENDING_UPDATE; // called from apptask
}

// set the 'creation' date of lastBackup so that the backup persists across time based archival rules
// s3 does not allow changing creation time, so copying the last backup is easy way out for now
function reuseOldBackup(app, callback) {
    assert.strictEqual(typeof app.lastBackupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    backups.copyLastBackup(app, function (error, newBackupId) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debugApp(app, 'reuseOldBackup: reused old backup %s as %s', app.lastBackupId, newBackupId);

        callback(null, newBackupId);
    });
}

function createNewBackup(app, addonsToBackup, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!addonsToBackup || typeof addonsToBackup, 'object');
    assert.strictEqual(typeof callback, 'function');

    backups.getBackupUrl(app, function (error, backupArchive) {
        if (error && error.reason === BackupsError.EXTERNAL_ERROR) return callback(new AppsError(AppsError.EXTERNAL_ERROR, error.message));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        backups.getAppBackupConfigUrl(app, function (error, backupConfig) {
            if (error && error.reason === BackupsError.EXTERNAL_ERROR) return callback(new AppsError(AppsError.EXTERNAL_ERROR, error.message));
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            debugApp(app, 'backupApp: backup url:%s backup config url:%s', backupArchive.url, backupConfig.url);

            async.series([
                ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
                addons.backupAddons.bind(null, app, addonsToBackup),
                shell.sudo.bind(null, 'backupApp', [ BACKUP_APP_CMD,  app.id, backupArchive.url, backupConfig.url, backupArchive.backupKey, backupArchive.sessionToken ]),
                ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
            ], function (error) {
                if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

                callback(null, backupArchive.id);
            });
        });
    });
}

function backupApp(app, addonsToBackup, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(!addonsToBackup || typeof addonsToBackup, 'object');
    assert.strictEqual(typeof callback, 'function');

    var appConfig = null, backupFunction;

    if (!canBackupApp(app)) {
        if (!app.lastBackupId) {
            debugApp(app, 'backupApp: cannot backup app');
            return callback(new AppsError(AppsError.BAD_STATE, 'App not healthy and never backed up previously'));
        }

        appConfig = app.lastBackupConfig;
        backupFunction = reuseOldBackup.bind(null, app);
    } else {
        appConfig = {
            manifest: app.manifest,
            location: app.location,
            portBindings: app.portBindings,
            accessRestriction: app.accessRestriction,
            oauthProxy: app.oauthProxy,
            memoryLimit: app.memoryLimit
        };
        backupFunction = createNewBackup.bind(null, app, addonsToBackup);

        if (!safe.fs.writeFileSync(path.join(paths.DATA_DIR, app.id + '/config.json'), JSON.stringify(appConfig), 'utf8')) {
            return callback(safe.error);
        }
    }

    backupFunction(function (error, backupId) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debugApp(app, 'backupApp: successful id:%s', backupId);

        setRestorePoint(app.id, backupId, appConfig, function (error) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            return callback(null, backupId);
        });
    });
}

function backup(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    appdb.exists(appId, function (error, exists) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));
        if (!exists) return callback(new AppsError(AppsError.NOT_FOUND));

        appdb.setInstallationCommand(appId, appdb.ISTATE_PENDING_BACKUP, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError(AppsError.BAD_STATE)); // might be a bad guess
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            taskmanager.restartAppTask(appId);

            callback(null);
        });
    });
}

function restoreApp(app, addonsToRestore, backupId, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof addonsToRestore, 'object');
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');
    assert(app.lastBackupId);

    backups.getRestoreUrl(backupId, function (error, result) {
        if (error && error.reason == BackupsError.EXTERNAL_ERROR) return callback(new AppsError(AppsError.EXTERNAL_ERROR, error.message));
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

        debugApp(app, 'restoreApp: restoreUrl:%s', result.url);

        shell.sudo('restoreApp', [ RESTORE_APP_CMD,  app.id, result.url, result.backupKey, result.sessionToken ], function (error) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            addons.restoreAddons(app, addonsToRestore, callback);
        });
    });
}

function listBackups(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    appdb.exists(appId, function (error, exists) {
        if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));
        if (!exists) return callback(new AppsError(AppsError.NOT_FOUND));

        // TODO pagination is not implemented in the backend yet
        backups.getAllPaged(0, 1000, function (error, result) {
            if (error) return callback(new AppsError(AppsError.INTERNAL_ERROR, error));

            var appBackups = [];

            result.forEach(function (backup) {
                appBackups = appBackups.concat(backup.dependsOn.filter(function (d) {
                    return d.indexOf('appbackup_' + appId) === 0;
                }));
            });

            // alphabetic should be sufficient
            appBackups.sort();

            callback(null, appBackups);
        });
    });
}
