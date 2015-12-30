/* jslint node:true */

'use strict';

exports = module.exports = {
    getSignedUploadUrl: getSignedUploadUrl,
    getSignedDownloadUrl: getSignedDownloadUrl,

    copyObject: copyObject,
    getAllPaged: getAllPaged
};

var assert = require('assert'),
    AWS = require('aws-sdk');

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

function getAllPaged(backupConfig, page, perPage, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    getBackupCredentials(backupConfig, function (error, credentials) {
        if (error) return callback(error);

        var s3 = new AWS.S3(credentials);

        var params = {
            Bucket: backupConfig.bucket,
            EncodingType: 'url',
            Prefix: backupConfig.prefix + '/backup_'
        };

        s3.listObjects(params, function (error, data) {
            if (error) return callback(error);

            var results = data.Contents.map(function (backup) {
                var key = backup.Key.slice(backupConfig.prefix.length + 1);

                // This depends on the backups.js format of backup names :-(
                var version = key.slice(key.lastIndexOf('-') + 2, -7);

                return {
                    creationTime: backup.LastModified,
                    boxVersion: version,
                    restoreKey: key,
                    dependsOn: []               // FIXME we have no information here
                };
            });

            results.sort(function (a, b) { return a.creationTime < b.creationTime; });

            return callback(null, results);
        });
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
