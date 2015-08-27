/* jslint node:true */

'use strict';

exports = module.exports = {
    AWSError: AWSError,

    getAWSCredentials: getAWSCredentials,

    getSignedUploadUrl: getSignedUploadUrl,
    getSignedDownloadUrl: getSignedDownloadUrl
};

var assert = require('assert'),
    AWS = require('aws-sdk'),
    config = require('./config.js'),
    debug = require('debug')('box:aws'),
    superagent = require('superagent'),
    util = require('util');

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AWSError(reason, errorOrMessage) {
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
util.inherits(AWSError, Error);
AWSError.INTERNAL_ERROR = 'Internal Error';
AWSError.MISSING_CREDENTIALS = 'Missing AWS credentials';

function getAWSCredentials(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('getAWSCredentials()');

    // CaaS
    if (config.token()) {
        var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/awscredentials';
        superagent.get(url).query({ token: config.token() }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 201) return callback(new Error(result.text));
            if (!result.body || !result.body.credentials) return callback(new Error('Unexpected response'));

            debug('getAWSCredentials()', result.body.credentials);

            return callback(null, {
                accessKeyId: result.body.credentials.AccessKeyId,
                secretAccessKey: result.body.credentials.SecretAccessKey,
                sessionToken: result.body.credentials.SessionToken,
                region: 'us-east-1'
            });
        });
    } else {
        if (!config.aws().accessKeyId || !config.aws().secretAccessKey) return callback(new AWSError(AWSError.MISSING_CREDENTIALS));

        callback(null, {
            accessKeyId: config.aws().accessKeyId,
            secretAccessKey: config.aws().secretAccessKey,
            region: 'us-east-1'
        });
    }
}

function getSignedUploadUrl(filename, callback) {
    assert.strictEqual(typeof filename, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('getSignedUploadUrl()');

    getAWSCredentials(function (error, credentials) {
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

    debug('getSignedDownloadUrl()');

    getAWSCredentials(function (error, credentials) {
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
