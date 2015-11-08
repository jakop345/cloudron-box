/* jslint node:true */

'use strict';

exports = module.exports = {
    getSignedUploadUrl: getSignedUploadUrl,
    getSignedDownloadUrl: getSignedDownloadUrl,

    copyObject: copyObject,

    getAllPaged: getAllPaged
};

var assert = require('assert'),
    AWS = require('aws-sdk'),
    config = require('../config.js'),
    superagent = require('superagent'),
    util = require('util');

function getBackupCredentials(backupConfig, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof callback, 'function');
    assert(backupConfig.token);

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/awscredentials';
    superagent.post(url).query({ token: backupConfig.token }).end(function (error, result) {
        if (error) return callback(error);
        if (result.statusCode !== 201) return callback(new Error(result.text));
        if (!result.body || !result.body.credentials) return callback(new Error('Unexpected response'));

        var credentials = {
            accessKeyId: result.body.credentials.AccessKeyId,
            secretAccessKey: result.body.credentials.SecretAccessKey,
            sessionToken: result.body.credentials.SessionToken,
            region: 'us-east-1'
        };

        if (backupConfig.endpoint) credentials.endpoint = new AWS.Endpoint(backupConfig.endpoint);

        callback(null, credentials);
    });
}

function getAllPaged(backupConfig, page, perPage, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backups';
    superagent.get(url).query({ token: backupConfig.token }).end(function (error, result) {
        if (error) return callback(error);
        if (result.statusCode !== 200) return callback(new Error(result.text));
        if (!result.body || !util.isArray(result.body.backups)) return callback(new Error('Unexpected response'));

        // [ { creationTime, boxVersion, restoreKey, dependsOn: [ ] } ] sorted by time (latest first)
        return callback(null, result.body.backups);
    });
}

function getSignedUploadUrl(backupConfig, filename, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(backupConfig, function (error, credentials) {
        if (error) return callback(error);

        var s3 = new AWS.S3(credentials);

        var params = {
            Bucket: backupConfig.bucket,
            Key: backupConfig.prefix + '/' + filename,
            Expires: 60 * 30 /* 30 minutes */
        };

        var url = s3.getSignedUrl('putObject', params);

        callback(null, { url : url, sessionToken: credentials.sessionToken });
    });
}

function getSignedDownloadUrl(backupConfig, filename, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(backupConfig, function (error, credentials) {
        if (error) return callback(error);

        var s3 = new AWS.S3(credentials);

        var params = {
            Bucket: backupConfig.bucket,
            Key: backupConfig.prefix + '/' + filename,
            Expires: 60 * 30 /* 30 minutes */
        };

        var url = s3.getSignedUrl('getObject', params);

        callback(null, { url: url, sessionToken: credentials.sessionToken });
    });
}

function copyObject(backupConfig, from, to, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof from, 'string');
    assert.strictEqual(typeof to, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(backupConfig, function (error, credentials) {
        if (error) return callback(error);

        var params = {
            Bucket: backupConfig.bucket, // target bucket
            Key: backupConfig.prefix + '/' + to, // target file
            CopySource: backupConfig.bucket + '/' + backupConfig.prefix + '/' + from, // source
        };

        var s3 = new AWS.S3(credentials);
        s3.copyObject(params, callback);
    });
}
