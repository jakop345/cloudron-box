'use strict';


exports.BackupsError = BackupsError;

exports.getAll = getAll;

exports.scheduleBackup = scheduleBackup;
exports.scheduleAppBackup = scheduleAppBackup;

exports.getBackupUrl = getBackupUrl;
exports.getRestoreUrl = getRestoreUrl;

exports.backup = backup;
exports.backupBox = backupBox;
exports.backupApp = backupApp;

exports.restoreApp = restoreApp;


var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    config = require('../config.js'),
    debug = require('debug')('box:backups'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    superagent = require('superagent'),
    util = require('util');

var BACKUP_BOX_CMD = path.join(__dirname, 'scripts/backupbox.sh'),
    BACKUP_APP_CMD = path.join(__dirname, 'scripts/backupapp.sh'),
    RESTORE_APP_CMD = path.join(__dirname, 'scripts/restoreapp.sh'),
    BACKUP_SWAP_CMD = path.join(__dirname, 'scripts/backupswap.sh');

function BackupsError(reason, errorOrMessage) {
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
util.inherits(BackupsError, Error);
BackupsError.NOT_FOUND = 'not found';
BackupsError.BAD_STATE = 'bad state';
BackupsError.EXTERNAL_ERROR = 'external error';
BackupsError.INTERNAL_ERROR = 'internal error';

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

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backups';

    superagent.get(url).query({ token: config.token() }).end(function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));
        if (result.statusCode !== 200) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, result.text));

        // [ { creationTime, boxVersion, restoreKey, dependsOn: [ ] } ] sorted by time (latest first)
        return callback(null, result.body.backups);
    });
}

function scheduleBackup(callback) {
    assert.strictEqual(typeof callback, 'function');

    backup(function (error) {
        if (error) console.error('backup failed.', error);
    });

    // we just schedule the backup but do not wait for the result
    callback(null);
}

function canBackupApp(app) {
    // only backup apps that are installed or pending configure. Rest of them are in some
    // state not good for consistent backup

    return (app.installationState === appdb.ISTATE_INSTALLED && app.health === appdb.HEALTH_HEALTHY) || app.installationState === appdb.ISTATE_PENDING_CONFIGURE;
}

function scheduleAppBackup(appId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    apps.get(appId, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return callback(new BackupsError(BackupsError.NOT_FOUND));
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        if (!canBackupApp(app)) return callback(new BackupsError(BackupsError.BAD_STATE, 'App not healthy'));

        backupApp(app, function (error) {
            if (error) console.error('backup failed.', error);
        });

        callback(null);
    });
}

function getBackupUrl(app, appBackupIds, callback) {
    assert(!app || typeof app === 'object');
    assert(!appBackupIds || util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backupurl';

    var data = {
        boxVersion: config.version(),
        appId: app ? app.id : null,
        appVersion: app ? app.manifest.version : null,
        appBackupIds: appBackupIds
    };

    superagent.put(url).query({ token: config.token() }).send(data).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned backup url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned backup url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function getRestoreUrl(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/restoreurl';

    superagent.put(url).query({ token: config.token(), backupId: backupId }).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned download url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned download url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function restoreApp(app, callback) {
    if (!app.lastBackupId) {
        debugApp(app, 'No existing backup to return to. Proceeding to setup addons');
        return addons.setupAddons(app, callback);
    }

   getRestoreUrl(app.lastBackupId, function (error, result) {
        if (error) return callback(error);

        debugApp(app, 'restoreApp: restoreUrl:%s', result.url);

        shell.sudo('restoreApp', [ RESTORE_APP_CMD,  app.id, result.url, result.backupKey ], function (error) {
            if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

            addons.restoreAddons(app, callback);
        });
    });
}

function backupApp(app, callback) {
    if (!safe.fs.writeFileSync(path.join(paths.DATA_DIR, app.id + '/config.json'), JSON.stringify(app))) {
        return callback(safe.error);
    }

    getBackupUrl(app, null, function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        debugApp(app, 'backupApp: backup url:%s backup id:%s', result.url, result.id);

        async.series([
            ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
            addons.backupAddons.bind(null, app),
            shell.sudo.bind(null, 'backupApp', [ BACKUP_APP_CMD,  app.id, result.url, result.backupKey ]),
            ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
        ], function (error) {
            if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

            debugApp(app, 'backupApp: successful id:%s', result.id);

            apps.setRestorePoint(app.id, result.id, app.manifest, function (error) {
                if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                return callback(null, result.id);
            });
        });
    });
}

function backupBoxWithAppBackupIds(appBackupIds, callback) {
    assert(util.isArray(appBackupIds));

    getBackupUrl(null /* app */, appBackupIds, function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error.message));

        debug('backup: url %s', result.url);

        async.series([
            ignoreError(shell.sudo.bind(null, 'mountSwap', [ BACKUP_SWAP_CMD, '--on' ])),
                        shell.sudo.bind(null, 'backupBox', [ BACKUP_BOX_CMD, result.url, result.backupKey ]),
            ignoreError(shell.sudo.bind(null, 'unmountSwap', [ BACKUP_SWAP_CMD, '--off' ])),
        ], function (error) {
            if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

            debug('backup: successful');

            callback(null, result.id);
        });
    });
}

function backupBox(callback) {
    apps.getAll(function (error, allApps) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        var appBackupIds = allApps.map(function (app) { return app.lastBackupId; });

        backupBoxWithAppBackupIds(appBackupIds, callback);
    });
}

function backup(callback) {
    callback = callback || function () { }; // callback can be empty for timer triggered backup

    apps.getAll(function (error, allApps) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        var processed = 0;
        var step = 100/(allApps.length+1);

        progress.set(progress.BACKUP, processed, '');

        async.mapSeries(allApps, function iterator(app, iteratorCallback) {
            ++processed;

            if (canBackupApp(app)) {
                return backupApp(app, function (error, backupId) {
                    progress.set(progress.BACKUP, step * processed, app.location);
                    iteratorCallback(error, backupId);
                });
            }

            debugApp(app, 'Skipping backup (istate:%s health%s). Reusing %s', app.installationState, app.health, app.lastBackupId);
            progress.set(progress.BACKUP, step * processed, app.location);

            return iteratorCallback(null, app.lastBackupId);
        }, function appsBackedUp(error, backupIds) {
            if (error) return callback(error);

            backupIds = backupIds.filter(function (id) { return id !== null; }); // remove apps that were never backed up

            backupBoxWithAppBackupIds(backupIds, function (error, restoreKey) {
                progress.set(progress.BACKUP, 100, '');
                callback(error, restoreKey);
            });
        });
    });
}

