'use strict';

exports = module.exports = {
    BackupsError: BackupsError,

    testConfig: testConfig,

    getPaged: getPaged,
    getByAppIdPaged: getByAppIdPaged,

    getRestoreUrl: getRestoreUrl,
    getRestoreConfig: getRestoreConfig,

    ensureBackup: ensureBackup,

    backup: backup,
    backupApp: backupApp,
    restoreApp: restoreApp,

    backupBoxAndApps: backupBoxAndApps,

    getLocalDownloadPath: getLocalDownloadPath,

    removeBackup: removeBackup
};

var addons = require('./addons.js'),
    appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    async = require('async'),
    assert = require('assert'),
    backupdb = require('./backupdb.js'),
    caas = require('./storage/caas.js'),
    config = require('./config.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:backups'),
    eventlog = require('./eventlog.js'),
    filesystem = require('./storage/filesystem.js'),
    locker = require('./locker.js'),
    mailer = require('./mailer.js'),
    path = require('path'),
    paths = require('./paths.js'),
    progress = require('./progress.js'),
    s3 = require('./storage/s3.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    settings = require('./settings.js'),
    SettingsError = require('./settings.js').SettingsError,
    util = require('util'),
    webhooks = require('./webhooks.js');

var BACKUP_BOX_CMD = path.join(__dirname, 'scripts/backupbox.sh'),
    BACKUP_APP_CMD = path.join(__dirname, 'scripts/backupapp.sh'),
    RESTORE_APP_CMD = path.join(__dirname, 'scripts/restoreapp.sh');

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

function debugApp(app, args) {
    assert(!app || typeof app === 'object');

    var prefix = app ? app.location : '(no app)';
    debug(prefix + ' ' + util.format.apply(util, Array.prototype.slice.call(arguments, 1)));
}

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
BackupsError.EXTERNAL_ERROR = 'external error';
BackupsError.INTERNAL_ERROR = 'internal error';
BackupsError.BAD_STATE = 'bad state';
BackupsError.NOT_FOUND = 'not found';
BackupsError.MISSING_CREDENTIALS = 'missing credentials';

// choose which storage backend we use for test purpose we use s3
function api(provider) {
    switch (provider) {
        case 'caas': return caas;
        case 's3': return s3;
        case 'filesystem': return filesystem;
        default: return null;
    }
}

function testConfig(backupConfig, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    var func = api(backupConfig.provider);
    if (!func) return callback(new SettingsError(SettingsError.BAD_FIELD, 'unkown storage provider'));

    api(backupConfig.provider).testConfig(backupConfig, callback);
}

function getPaged(page, perPage, callback) {
    assert(typeof page === 'number' && page > 0);
    assert(typeof perPage === 'number' && perPage > 0);
    assert.strictEqual(typeof callback, 'function');

    backupdb.getPaged(page, perPage, function (error, results) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function getByAppIdPaged(page, perPage, appId, callback) {
    assert(typeof page === 'number' && page > 0);
    assert(typeof perPage === 'number' && perPage > 0);
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof callback, 'function');

    backupdb.getByAppIdPaged(page, perPage, appId, function (error, results) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

// backupId is the filename. appbackup_%s_%s-v%s.tar.gz
function getRestoreConfig(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getAppRestoreConfig(backupConfig, backupId, function (error, result) {
            if (error && error.reason === BackupsError.NOT_FOUND) return callback(error);
            if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));

            callback(null, result);
        });
    });
}

// backupId is the filename. appbackup_%s_%s-v%s.tar.gz
function getRestoreUrl(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getRestoreUrl(backupConfig, backupId, function (error, result) {
            if (error) return callback(error);

            var obj = {
                id: backupId,
                url: result.url,
                backupKey: backupConfig.key,
                sha1: result.sha1 || null       // not supported by all backends
            };

            debug('getRestoreUrl: id:%s url:%s backupKey:%s sha1:%s', obj.id, obj.url, obj.backupKey, obj.sha1);

            callback(null, obj);
        });
    });
}

function copyLastBackup(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof app.lastBackupId, 'string');
    assert(manifest && typeof manifest === 'object');
    assert.strictEqual(typeof callback, 'function');

    var now = new Date();
    var toFilenameArchive = util.format('appbackup_%s_%s-v%s.tar.gz', app.id, now.toISOString(), manifest.version);
    var toFilenameConfig = util.format('appbackup_%s_%s-v%s.json', app.id, now.toISOString(), manifest.version);

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        debug('copyLastBackup: copying archive %s to %s', app.lastBackupId, toFilenameArchive);

        api(backupConfig.provider).copyObject(backupConfig, app.lastBackupId, toFilenameArchive, function (error) {
            if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));

            // TODO change that logic by adjusting app.lastBackupId to not contain the file type
            var configFileId = app.lastBackupId.slice(0, -'.tar.gz'.length) + '.json';

            debug('copyLastBackup: copying config %s to %s', configFileId, toFilenameConfig);

            api(backupConfig.provider).copyObject(backupConfig, configFileId, toFilenameConfig, function (error) {
                if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));

                return callback(null, toFilenameArchive);
            });
        });
    });
}

function backupBoxWithAppBackupIds(appBackupIds, callback) {
    assert(util.isArray(appBackupIds));

    var now = new Date();
    var filebase = util.format('backup_%s-v%s', now.toISOString(), config.version());
    var filename = filebase + '.tar.gz';

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getBoxBackupDetails(backupConfig, filename, function (error, result) {
            if (error) return callback(error);

            debug('backupBoxWithAppBackupIds: backup details %j', result);

            shell.sudo('backupBox', [ BACKUP_BOX_CMD ].concat(result.backupScriptArguments), function (error) {
                if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                debug('backupBoxWithAppBackupIds: success');

                backupdb.add({ id: filename, version: config.version(), type: backupdb.BACKUP_TYPE_BOX, dependsOn: appBackupIds }, function (error) {
                    if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                    webhooks.backupDone(filename, null /* app */, appBackupIds, function (error) {
                        if (error) return callback(error);
                        callback(null, filename);
                    });
                });
            });
        });
    });
}

// this function expects you to have a lock
// function backupBox(callback) {
//    apps.getAll(function (error, allApps) {
//         if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));
//
//         var appBackupIds = allApps.map(function (app) { return app.lastBackupId; });
//         appBackupIds = appBackupIds.filter(function (id) { return id !== null; }); // remove apps that were never backed up
//
//         backupBoxWithAppBackupIds(appBackupIds, callback);
//     });
// }

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
function reuseOldAppBackup(app, manifest, callback) {
    assert.strictEqual(typeof app.lastBackupId, 'string');
    assert(manifest && typeof manifest === 'object');
    assert.strictEqual(typeof callback, 'function');

    copyLastBackup(app, manifest, function (error, newBackupId) {
        if (error) return callback(error);

        debugApp(app, 'reuseOldAppBackup: reused old backup %s as %s', app.lastBackupId, newBackupId);

        callback(null, newBackupId);
    });
}

function createNewAppBackup(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(manifest && typeof manifest === 'object');
    assert.strictEqual(typeof callback, 'function');

    var now = new Date();
    var filebase = util.format('appbackup_%s_%s-v%s', app.id, now.toISOString(), manifest.version);
    var configFilename = filebase + '.json', dataFilename = filebase + '.tar.gz';

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getAppBackupDetails(backupConfig, app.id, dataFilename, configFilename, function (error, result) {
            if (error) return callback(error);

            debug('createNewAppBackup: backup details %j', result);

            async.series([
                addons.backupAddons.bind(null, app, manifest.addons),
                shell.sudo.bind(null, 'backupApp', [ BACKUP_APP_CMD ].concat(result.backupScriptArguments))
            ], function (error) {
                if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                debugApp(app, 'createNewAppBackup: %s done', dataFilename);

                backupdb.add({ id: dataFilename, version: manifest.version, type: backupdb.BACKUP_TYPE_APP, dependsOn: [ ] }, function (error) {
                    if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                    callback(null, dataFilename);
                });
            });
        });
    });
}

function setRestorePoint(appId, lastBackupId, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof lastBackupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    appdb.update(appId, { lastBackupId: lastBackupId }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new BackupsError(BackupsError.NOT_FOUND, 'No such app'));
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

function backupApp(app, manifest, callback) {
    assert.strictEqual(typeof app, 'object');
    assert(manifest && typeof manifest === 'object');
    assert.strictEqual(typeof callback, 'function');

    var backupFunction;

    if (!canBackupApp(app)) {
        if (!app.lastBackupId) {
            debugApp(app, 'backupApp: cannot backup app');
            return callback(new BackupsError(BackupsError.BAD_STATE, 'App not healthy and never backed up previously'));
        }

        backupFunction = reuseOldAppBackup.bind(null, app, manifest);
    } else {
        var appConfig = apps.getAppConfig(app);
        appConfig.manifest = manifest;
        backupFunction = createNewAppBackup.bind(null, app, manifest);

        if (!safe.fs.writeFileSync(path.join(paths.DATA_DIR, app.id + '/config.json'), JSON.stringify(appConfig), 'utf8')) {
            return callback(safe.error);
        }
    }

    backupFunction(function (error, backupId) {
        if (error) return callback(error);

        debugApp(app, 'backupApp: successful id:%s', backupId);

        setRestorePoint(app.id, backupId, function (error) {
            if (error) return callback(error);

            return callback(null, backupId);
        });
    });
}

// this function expects you to have a lock
function backupBoxAndApps(auditSource, callback) {
    assert.strictEqual(typeof auditSource, 'object');

    callback = callback || NOOP_CALLBACK;

    eventlog.add(eventlog.ACTION_BACKUP_START, auditSource, { });

    apps.getAll(function (error, allApps) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        var processed = 0;
        var step = 100/(allApps.length+1);

        progress.set(progress.BACKUP, processed, '');

        async.mapSeries(allApps, function iterator(app, iteratorCallback) {
            ++processed;

            backupApp(app, app.manifest, function (error, backupId) {
                if (error && error.reason !== BackupsError.BAD_STATE) {
                    debugApp(app, 'Unable to backup', error);
                    return iteratorCallback(error);
                }

                progress.set(progress.BACKUP, step * processed, 'Backed up app at ' + app.location);

                iteratorCallback(null, backupId || null); // clear backupId if is in BAD_STATE and never backed up
            });
        }, function appsBackedUp(error, backupIds) {
            if (error) {
                progress.set(progress.BACKUP, 100, error.message);
                return callback(error);
            }

            backupIds = backupIds.filter(function (id) { return id !== null; }); // remove apps in bad state that were never backed up

            backupBoxWithAppBackupIds(backupIds, function (error, filename) {
                progress.set(progress.BACKUP, 100, error ? error.message : '');

                eventlog.add(eventlog.ACTION_BACKUP_FINISH, auditSource, { errorMessage: error ? error.message : null, filename: filename });

                callback(error, filename);
            });
        });
    });
}

function backup(auditSource, callback) {
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    var error = locker.lock(locker.OP_FULL_BACKUP);
    if (error) return callback(new BackupsError(BackupsError.BAD_STATE, error.message));

    progress.set(progress.BACKUP, 0, 'Starting'); // ensure tools can 'wait' on progress

    backupBoxAndApps(auditSource, function (error) { // start the backup operation in the background
        if (error) {
            debug('backup failed.', error);
            mailer.backupFailed(JSON.stringify(error));
        }

        locker.unlock(locker.OP_FULL_BACKUP);
    });

    callback(null);
}

function ensureBackup(auditSource, callback) {
    assert.strictEqual(typeof auditSource, 'object');

    getPaged(1, 1, function (error, backups) {
        if (error) {
            debug('Unable to list backups', error);
            return callback(error); // no point trying to backup if appstore is down
        }

        if (backups.length !== 0 && (new Date() - new Date(backups[0].creationTime) < 23 * 60 * 60 * 1000)) { // ~1 day ago
            debug('Previous backup was %j, no need to backup now', backups[0]);
            return callback(null);
        }

        backup(auditSource, callback);
    });
}

function restoreApp(app, addonsToRestore, backupId, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof addonsToRestore, 'object');
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');
    assert(app.lastBackupId);

    getRestoreUrl(backupId, function (error, result) {
        if (error) return callback(error);

        debugApp(app, 'restoreApp: restoreUrl:%s', result.url);

        shell.sudo('restoreApp', [ RESTORE_APP_CMD,  app.id, result.url, result.backupKey, result.sessionToken ], function (error) {
            if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

            addons.restoreAddons(app, addonsToRestore, callback);
        });
    });
}

function getLocalDownloadPath(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getLocalFilePath(backupConfig, backupId, function (error, result) {
            if (error) return callback(error);

            debug('getLocalDownloadPath: id:%s path:%s', backupId, result.filePath);

            callback(null, result.filePath);
        });
    });
}

function removeBackup(backupId, appBackupIds, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert(util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    debug('removeBackup: %s', backupId);

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).removeBackup(backupConfig, backupId, appBackupIds, function (error) {
            if (error) return callback(error);

            backupdb.del(backupId, function (error) {
                if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                debug('removeBackup: %s done', backupId);

                callback(null);
            });
        });
    });
}
