'use strict';

exports = module.exports = {
    getBoxBackupDetails: getBoxBackupDetails,
    getAppBackupDetails: getAppBackupDetails,

    getRestoreUrl: getRestoreUrl,
    getAppRestoreConfig: getAppRestoreConfig,
    getLocalFilePath: getLocalFilePath,

    copyObject: copyObject,
    removeBackup: removeBackup,

    testConfig: testConfig
};

var assert = require('assert'),
    async = require('async'),
    BackupsError = require('../backups.js').BackupsError,
    checksum = require('checksum'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance'),
    SettingsError = require('../settings.js').SettingsError,
    shell = require('../shell.js'),
    util = require('util');

var FALLBACK_BACKUP_FOLDER = '/var/backups';
var RMBACKUP_CMD = path.join(__dirname, '../scripts/rmbackup.sh');

function getBoxBackupDetails(apiConfig, id, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;

    var details = {
        backupScriptArguments: [ 'filesystem', backupFolder, id, apiConfig.key ]
    };

    callback(null, details);
}

function getAppBackupDetails(apiConfig, appId, dataId, configId, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof dataId, 'string');
    assert.strictEqual(typeof configId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;

    var details = {
        backupScriptArguments: [ 'filesystem', appId, backupFolder, configId, dataId, apiConfig.key ]
    };

    callback(null, details);
}

function getRestoreUrl(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;
    var restoreUrl = 'file://' + path.join(backupFolder, filename);

    checksum.file(path.join(backupFolder, filename), function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.INTERNAL_ERROR, util.format('Failed to calculate checksum:', error)));

        callback(null, { url: restoreUrl, sha1: result });
    });
}

function getAppRestoreConfig(apiConfig, backupId, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;
    var configFilename = backupId.replace(/\.tar\.gz$/, '.json');

    var restoreConfig = safe.require(path.join(backupFolder, configFilename));
    if (!restoreConfig) return callback(new BackupsError(BackupsError.NOT_FOUND, 'No app backup config found for ' + configFilename));

    callback(null, restoreConfig);
}

function getLocalFilePath(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;

    callback(null, { filePath: path.join(backupFolder, filename) });
}

function copyObject(apiConfig, from, to, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof from, 'string');
    assert.strictEqual(typeof to, 'string');
    assert.strictEqual(typeof callback, 'function');

    var calledBack = false;
    function done (error) {
        if (!calledBack) callback(error);
        calledBack = true;
    }

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;
    var readStream = fs.createReadStream(path.join(backupFolder, from));
    var writeStream = fs.createWriteStream(path.join(backupFolder, to));

    readStream.on('error', done);
    writeStream.on('error', done);

    writeStream.on('close', function () {
        // avoid passing arguments
        done(null);
    });

    readStream.pipe(writeStream);
}

function removeBackup(apiConfig, backupId, appBackupIds, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof backupId, 'string');
    assert(Array.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;
    var appBackupJSONFiles = appBackupIds.map(function (id) { return id.replace(/\.tar\.gz$/, '.json'); });

    async.each([backupId].concat(appBackupIds).concat(appBackupJSONFiles), function (id, callback) {
        var filePath = path.join(backupFolder, id);

        shell.sudo('deleteBackup', [ RMBACKUP_CMD, filePath ], function (error) {
            if (error) console.error('Unable to remove %s. Not fatal.', filePath, safe.error);
            callback();
        });
    }, callback);
}

function testConfig(apiConfig, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (typeof apiConfig.backupFolder !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'backupFolder must be string'));

    callback();
}
