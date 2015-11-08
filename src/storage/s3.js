/* jslint node:true */

'use strict';

exports = module.exports = {
    getSignedUploadUrl: getSignedUploadUrl,
    getSignedDownloadUrl: getSignedDownloadUrl,

    copyObject: copyObject
};

var assert = require('assert'),
    AWS = require('aws-sdk'),
    config = require('../config.js');

function getBackupCredentials(backupConfig, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    assert(backupConfig.accessKeyId && backupConfig.secretAccessKey);

    var credentials = {
        accessKeyId: backupConfig.accessKeyId,
        secretAccessKey: backupConfig.secretAccessKey,
        region: 'us-east-1'
    };

    if (backupConfig.endpoint) credentials.endpoint = new AWS.Endpoint(backupConfig.endpoint);

    callback(null, credentials);
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
