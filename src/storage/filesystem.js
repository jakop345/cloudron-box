'use strict';

exports = module.exports = {
    getBoxBackupDetails: getBoxBackupDetails,
    getAppBackupDetails: getAppBackupDetails,

    getAllPaged: getAllPaged,

    getRestoreUrl: getRestoreUrl,

    copyObject: copyObject
};

var assert = require('assert'),
    fs = require('fs'),
    path = require('path');

var FALLBACK_BACKUP_FOLDER = '/var/backups';

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

function getAllPaged(apiConfig, page, perPage, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;

    fs.readdir(backupFolder, function (error, entries) {
        if (error) return callback(error);

        var results = entries.map(function (entry) {
            return {
                creationTime: Date.now(),   // FIXME extract from filename or stat?
                restoreKey: entry,
                dependsOn: [] // FIXME empty dependsOn is wrong and version property is missing!!
            };
        });

        results.sort(function (a, b) { return a.creationTime < b.creationTime; });

        return callback(null, results);
    });
}

function getRestoreUrl(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    var backupFolder = apiConfig.backupFolder || FALLBACK_BACKUP_FOLDER;
    var restoreUrl = 'file://' + path.join(backupFolder, filename);

    callback(null, { url: restoreUrl });
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
