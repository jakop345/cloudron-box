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
    config = require('../config.js'),
    safe = require('safetydance'),
    SettingsError = require('../settings.js').SettingsError,
    superagent = require('superagent');

function getBackupCredentials(apiConfig, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof callback, 'function');
    assert(apiConfig.token);

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/awscredentials';
    superagent.post(url).query({ token: apiConfig.token }).timeout(30 * 1000).end(function (error, result) {
        if (error && !error.response) return callback(error);
        if (result.statusCode !== 201) return callback(new Error(result.text));
        if (!result.body || !result.body.credentials) return callback(new Error('Unexpected response'));

        var credentials = {
            signatureVersion: 'v4',
            accessKeyId: result.body.credentials.AccessKeyId,
            secretAccessKey: result.body.credentials.SecretAccessKey,
            sessionToken: result.body.credentials.SessionToken,
            region: apiConfig.region || 'us-east-1'
        };

        if (apiConfig.endpoint) credentials.endpoint = new AWS.Endpoint(apiConfig.endpoint);

        callback(null, credentials);
    });
}

function getBoxBackupDetails(apiConfig, id, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(apiConfig, function (error, result) {
        if (error) return callback(error);

        var s3Url = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/' + id;
        var region = apiConfig.region || 'us-east-1';

        var details = {
            backupScriptArguments: [ 's3', s3Url, result.accessKeyId, result.secretAccessKey, region, apiConfig.key, result.sessionToken ]
        };

        callback(null, details);
    });
}

function getAppBackupDetails(apiConfig, appId, dataId, configId, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof dataId, 'string');
    assert.strictEqual(typeof configId, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(apiConfig, function (error, result) {
        if (error) return callback(error);

        var s3DataUrl = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/' + dataId;
        var s3ConfigUrl = 's3://' + apiConfig.bucket + '/' + apiConfig.prefix + '/' + configId;
        var region = apiConfig.region || 'us-east-1';

        var details = {
            backupScriptArguments: [ 's3', appId, s3ConfigUrl, s3DataUrl, result.accessKeyId, result.secretAccessKey, region, apiConfig.key, result.sessionToken ]
        };

        callback(null, details);
    });
}

function getRestoreUrl(apiConfig, filename, callback) {
    assert.strictEqual(typeof apiConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (!apiConfig.bucket || !apiConfig.prefix) return new Error('Invalid configuration'); // prevent error in s3

    getBackupCredentials(apiConfig, function (error, credentials) {
        if (error) return callback(error);

        credentials.region = apiConfig.region; // use same region as where we uploaded
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

    if (!apiConfig.bucket || !apiConfig.prefix) return new Error('Invalid configuration'); // prevent error in s3

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

    if (config.provider() !== 'caas') return callback(new SettingsError(SettingsError.BAD_FIELD, 'instance provider must be caas'));

    callback();
}
