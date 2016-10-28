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
    AWS = require('aws-sdk'),
    safe = require('safetydance'),
    SettingsError = require('../settings.js').SettingsError,
    shell = require('../shell.js'),
    superagent = require('superagent');

function getBackupCredentials(apiConfig, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    assert(apiConfig.accessKeyId && apiConfig.secretAccessKey);

    var credentials = {
        signatureVersion: 'v4',
        accessKeyId: apiConfig.accessKeyId,
        secretAccessKey: apiConfig.secretAccessKey,
        region: apiConfig.region || 'us-east-1'
    };

    if (apiConfig.endpoint) credentials.endpoint = new AWS.Endpoint(apiConfig.endpoint);

    callback(null, credentials);
}

function getBoxBackupDetails(apiConfig, id, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    var s3Url = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/' + id;
    var region = apiConfig.region || 'us-east-1';

    var details = {
        backupScriptArguments: [ 's3', s3Url, apiConfig.accessKeyId, apiConfig.secretAccessKey, region, apiConfig.key ]
    };

    callback(null, details);
}

function getAppBackupDetails(apiConfig, appId, dataId, configId, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof dataId, 'string');
    assert.strictEqual(typeof configId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var s3DataUrl = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/' + dataId;
    var s3ConfigUrl = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/' + configId;
    var region = apiConfig.region || 'us-east-1';

    var details = {
        backupScriptArguments: [ 's3', appId, s3ConfigUrl, s3DataUrl, apiConfig.accessKeyId, apiConfig.secretAccessKey, region, apiConfig.key ]
    };

    callback(null, details);
}

function getRestoreUrl(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(apiConfig, function (error, credentials) {
        if (error) return callback(error);

        var s3 = new AWS.S3(credentials);

        var params = {
            Bucket: apiConfig.bucket,
            Key: apiConfig.prefix + '/' + filename,
            Expires: 60 * 60 * 24 /* 1 day */
        };

        var url = s3.getSignedUrl('getObject', params);

        callback(null, { url: url });
    });
}

function getAppRestoreConfig(apiConfig, backupId, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var configFilename = backupId.replace(/\.tar\.gz$/, '.json');

    getRestoreUrl(apiConfig, configFilename, function (error, result) {
        if (error) return callback(error);

        superagent.get(result.url).buffer(true).timeout(30 * 1000).end(function (error, response) {
            if (error && !error.response) return callback(new Error(error.message));
            if (response.statusCode !== 200) return callback(new Error('Invalid response code when getting config.json : ' + response.statusCode));

            var config = safe.JSON.parse(response.text);
            if (!config) return callback(new Error('Error in config:' + safe.error.message));

            return callback(null, config);
        });
    });
}

function getLocalFilePath(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    callback(new Error('not supported'));
}

function copyObject(apiConfig, from, to, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof from, 'string');
    assert.strictEqual(typeof to, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(apiConfig, function (error, credentials) {
        if (error) return callback(error);

        var params = {
            Bucket: apiConfig.bucket, // target bucket
            Key: apiConfig.prefix + '/' + to, // target file
            CopySource: apiConfig.bucket + '/' + apiConfig.prefix + '/' + from, // source
        };

        var s3 = new AWS.S3(credentials);
        s3.copyObject(params, callback);
    });
}

function removeBackup(apiConfig, backupId, appBackupIds, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof backupId, 'string');
    assert(Array.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    // Result: none

    callback(new Error('not implemented'));
}

function testConfig(apiConfig, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (typeof apiConfig.accessKeyId !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'accessKeyId must be a string'));
    if (typeof apiConfig.secretAccessKey !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'secretAccessKey must be a string'));
    if (typeof apiConfig.bucket !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'bucket must be a string'));
    if (typeof apiConfig.prefix !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'prefix must be a string'));

    // attempt to upload and delete a file with new credentials
    // First use the javascript api, to get better feedback, then use aws cli tool
    // The javascript api always autodetects the correct settings, regardless of the region provided, the cli tool does not
    getBackupCredentials(apiConfig, function (error, credentials) {
        if (error) return callback(error);

        var params = {
            Bucket: apiConfig.bucket,
            Key: apiConfig.prefix + '/testfile',
            Body: 'testcontent'
        };

        var s3 = new AWS.S3(credentials);
        s3.putObject(params, function (error) {
            if (error) return callback(new SettingsError(SettingsError.EXTERNAL_ERROR, error.message));

            var params = {
                Bucket: apiConfig.bucket,
                Key: apiConfig.prefix + '/testfile'
            };

            s3.deleteObject(params, function (error) {
                if (error) return callback(new SettingsError(SettingsError.EXTERNAL_ERROR, error.message));

                // now perform the same as what we do in the backup shell scripts
                var BACKUP_TEST_CMD = require('path').join(__dirname, '../scripts/backuptests3.sh');
                var tmpUrl = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/testfile';
                var args = [ tmpUrl, apiConfig.accessKeyId, apiConfig.secretAccessKey, apiConfig.region ];

                // if this fails the region is wrong, otherwise we would have failed earlier.
                shell.exec('backupTestS3', BACKUP_TEST_CMD, args, function (error) {
                    if (error) return callback(new SettingsError(SettingsError.EXTERNAL_ERROR, 'Wrong region'));

                    callback();
                });
            });
        });
    });
}
