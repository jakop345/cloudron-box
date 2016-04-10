'use strict';

exports = module.exports = {
    BackupsError: BackupsError,

    getPaged: getPaged,
    getByAppIdPaged: getByAppIdPaged,

    getBackupUrl: getBackupUrl,
    getAppBackupUrl: getAppBackupUrl,
    getRestoreUrl: getRestoreUrl,

    copyLastBackup: copyLastBackup,

    getBackupCredentials: getBackupCredentials
};

var assert = require('assert'),
    backupdb = require('./backupdb.js'),
    caas = require('./storage/caas.js'),
    config = require('./config.js'),
    debug = require('debug')('box:backups'),
    s3 = require('./storage/s3.js'),
    settings = require('./settings.js'),
    util = require('util');

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
BackupsError.MISSING_CREDENTIALS = 'missing credentials';

// choose which storage backend we use for test purpose we use s3
function api(provider) {
    switch (provider) {
        case 'caas': return caas;
        case 's3': return s3;
        default: return null;
    }
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

function getBackupCredentials(callback) {
    assert.strictEqual(typeof callback, 'function');

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getBackupCredentials(backupConfig, function (error, credentials) {
            if (error) return callback(error);

            return callback(null, credentials);
        });
    });
}

function getBackupUrl(appBackupIds, callback) {
    assert(util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    var now = new Date();
    var filebase = util.format('backup_%s-v%s', now.toISOString(), config.version());
    var filename = filebase + '.tar.gz';

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getBackupUrl(backupConfig, filename, function (error, result) {
            if (error) return callback(error);

            var obj = {
                id: result.id,
                url: result.url,
                backupKey: backupConfig.key
            };

            debug('getBackupUrl: id:%s url:%s backupKey:%s', obj.id, obj.url, obj.backupKey);

            backupdb.add({ id: result.id, version: config.version(), type: backupdb.BACKUP_TYPE_BOX, dependsOn: appBackupIds }, function (error) {
                if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                callback(null, obj);
            });
        });
    });
}

function getAppBackupUrl(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var now = new Date();
    var filebase = util.format('appbackup_%s_%s-v%s', app.id, now.toISOString(), app.manifest.version);
    var configFilename = filebase + '.json', dataFilename = filebase + '.tar.gz';

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).getBackupUrl(backupConfig, configFilename, function (error, configResult) {
            if (error) return callback(error);

            api(backupConfig.provider).getBackupUrl(backupConfig, dataFilename, function (error, dataResult) {
                if (error) return callback(error);

                var obj = {
                    id: dataResult.id,
                    url: dataResult.url,
                    configUrl: configResult.url,
                    backupKey: backupConfig.key // only data is encrypted
                };

                debug('getAppBackupUrl: %j', obj);

                backupdb.add({ id: obj.id, version: app.manifest.version, type: backupdb.BACKUP_TYPE_APP, dependsOn: [ ] }, function (error) {
                    if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

                    callback(null, obj);
                });
            });
        });
    });
}

// backupId is the s3 filename. appbackup_%s_%s-v%s.tar.gz
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
                backupKey: backupConfig.key
            };

            debug('getRestoreUrl: id:%s url:%s backupKey:%s', obj.id, obj.url, obj.backupKey);

            callback(null, obj);
        });
    });
}

function copyLastBackup(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof app.lastBackupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var toFilenameArchive = util.format('appbackup_%s_%s-v%s.tar.gz', app.id, (new Date()).toISOString(), app.manifest.version);
    var toFilenameConfig = util.format('appbackup_%s_%s-v%s.json', app.id, (new Date()).toISOString(), app.manifest.version);

    settings.getBackupConfig(function (error, backupConfig) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, error));

        api(backupConfig.provider).copyObject(backupConfig, app.lastBackupId, toFilenameArchive, function (error) {
            if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));

            // TODO change that logic by adjusting app.lastBackupId to not contain the file type
            var configFileId = app.lastBackupId.slice(0, -'.tar.gz'.length) + '.json';

            api(backupConfig.provider).copyObject(backupConfig, configFileId, toFilenameConfig, function (error) {
                if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));

                return callback(null, toFilenameArchive);
            });
        });
    });
}
