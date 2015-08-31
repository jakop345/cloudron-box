/* jslint node:true */

'use strict';

exports = module.exports = {
    AWSError: AWSError,

    getAWSCredentials: getAWSCredentials,

    getSignedUploadUrl: getSignedUploadUrl,
    getSignedDownloadUrl: getSignedDownloadUrl,

    addSubdomain: addSubdomain,
    delSubdomain: delSubdomain,
    getChangeStatus: getChangeStatus
};

var assert = require('assert'),
    AWS = require('aws-sdk'),
    config = require('./config.js'),
    debug = require('debug')('box:aws'),
    SubdomainError = require('./subdomainerror.js'),
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

    // CaaS
    if (config.token()) {
        var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/awscredentials';
        superagent.get(url).query({ token: config.token() }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 201) return callback(new Error(result.text));
            if (!result.body || !result.body.credentials) return callback(new Error('Unexpected response'));

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

function getZoneByName(zoneName, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('getZoneByName: %s', zoneName);

    getAWSCredentials(function (error, credentials) {
        if (error) return callback(error);

        var route53 = new AWS.Route53(credentials);
        route53.listHostedZones({}, function (error, result) {
            if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, new Error(error)));

            var zone = result.HostedZones.filter(function (zone) {
                return zone.Name.slice(0, -1) === zoneName;     // aws zone name contains a '.' at the end
            })[0];

            if (!zone) return callback(new SubdomainError(SubdomainError.NOT_FOUND, 'no such zone'));

            debug('getZoneByName: found zone', zone);

            callback(null, zone);
        });
    });
}

function addSubdomain(zoneName, subdomain, type, value, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('addSubdomain: ' + subdomain + ' for domain ' + zoneName + ' with value ' + value);

    getZoneByName(zoneName, function (error, zone) {
        if (error) return callback(error);

        var fqdn = config.appFqdn(subdomain);
        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        Type: type,
                        Name: fqdn,
                        ResourceRecords: [{
                            Value: value
                        }],
                        Weight: 0,
                        SetIdentifier: fqdn,
                        TTL: 1
                    }
                }]
            },
            HostedZoneId: zone.Id
        };

        getAWSCredentials(function (error, credentials) {
            if (error) return callback(error);

            var route53 = new AWS.Route53(credentials);
            route53.changeResourceRecordSets(params, function(error, result) {
                if (error && error.code === 'PriorRequestNotComplete') {
                    return callback(new SubdomainError(SubdomainError.STILL_BUSY, new Error(error)));
                } else if (error) {
                    return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, new Error(error)));
                }

                debug('addSubdomain: success. changeInfoId:%j', result);

                callback(null, result.ChangeInfo.Id);
            });
        });
    });
}

function delSubdomain(zoneName, subdomain, type, value, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('delSubdomain: %s for domain %s.', subdomain, zoneName);

    getZoneByName(zoneName, function (error, zone) {
        if (error) return callback(error);

        var fqdn = config.appFqdn(subdomain);
        var resourceRecordSet = {
            Name: fqdn,
            Type: type,
            ResourceRecords: [{
                Value: value
            }],
            Weight: 0,
            SetIdentifier: fqdn,
            TTL: 1
        };

        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: 'DELETE',
                    ResourceRecordSet: resourceRecordSet
                }]
            },
            HostedZoneId: zone.Id
        };

        getAWSCredentials(function (error, credentials) {
            if (error) return callback(error);

            var route53 = new AWS.Route53(credentials);
            route53.changeResourceRecordSets(params, function(error, result) {
                if (error && error.message && error.message.indexOf('it was not found') !== -1) {
                    debug('delSubdomain: resource record set not found.', error);
                    return callback(new SubdomainError(SubdomainError.NOT_FOUND, new Error(error)));
                } else if (error && error.code === 'NoSuchHostedZone') {
                    debug('delSubdomain: hosted zone not found.', error);
                    return callback(new SubdomainError(SubdomainError.NOT_FOUND, new Error(error)));
                } else if (error && error.code === 'PriorRequestNotComplete') {
                    debug('delSubdomain: resource is still busy', error);
                    return callback(new SubdomainError(SubdomainError.STILL_BUSY, new Error(error)));
                } else if (error && error.code === 'InvalidChangeBatch') {
                    debug('delSubdomain: invalid change batch. No such record to be deleted.');
                    return callback(new SubdomainError(SubdomainError.NOT_FOUND, new Error(error)));
                } else if (error) {
                    debug('delSubdomain: error', error);
                    return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, new Error(error)));
                }

                debug('delSubdomain: success');

                callback(null);
            });
        });
    });
}

function getChangeStatus(changeId, callback) {
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (changeId === '') return callback(null, 'INSYNC');

    getAWSCredentials(function (error, credentials) {
        if (error) return callback(error);

        var route53 = new AWS.Route53(credentials);
        route53.getChange({ Id: changeId }, function (error, result) {
            if (error) return callback(error);

            callback(null, result.ChangeInfo.Status);
        });
    });
}
