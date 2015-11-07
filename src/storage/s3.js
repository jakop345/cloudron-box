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

function getBackupCredentials(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (!config.aws().accessKeyId || !config.aws().secretAccessKey) return callback(new Error('missing credentials'));

    var credentials = {
        accessKeyId: config.aws().accessKeyId,
        secretAccessKey: config.aws().secretAccessKey,
        region: 'us-east-1'
    };

    if (config.aws().endpoint) credentials.endpoint = new AWS.Endpoint(config.aws().endpoint);

    callback(null, credentials);
}

function getSignedUploadUrl(filename, callback) {
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(function (error, credentials) {
        if (error) return callback(error);

        var s3 = new AWS.S3(credentials);

        var params = {
            Bucket: config.aws().backupBucket,
            Key: config.aws().backupPrefix + '/' + filename,
            Expires: 60 * 30 /* 30 minutes */
        };

        var url = s3.getSignedUrl('putObject', params);

        callback(null, { url : url, sessionToken: credentials.sessionToken });
    });
}

function getSignedDownloadUrl(filename, callback) {
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(function (error, credentials) {
        if (error) return callback(error);

        var s3 = new AWS.S3(credentials);

        var params = {
            Bucket: config.aws().backupBucket,
            Key: config.aws().backupPrefix + '/' + filename,
            Expires: 60 * 30 /* 30 minutes */
        };

        var url = s3.getSignedUrl('getObject', params);

        callback(null, { url: url, sessionToken: credentials.sessionToken });
    });
}

function copyObject(from, to, callback) {
    assert.strictEqual(typeof from, 'string');
    assert.strictEqual(typeof to, 'string');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(function (error, credentials) {
        if (error) return callback(error);

        var params = {
            Bucket: config.aws().backupBucket, // target bucket
            Key: config.aws().backupPrefix + '/' + to, // target file
            CopySource: config.aws().backupBucket + '/' + config.aws().backupPrefix + '/' + from, // source
        };

        var s3 = new AWS.S3(credentials);
        s3.copyObject(params, callback);
    });
}
