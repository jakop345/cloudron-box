/* jslint node:true */

'use strict';

exports = module.exports = {
    add: add,
    get: get,
    del: del,
    update: update,
    getChangeStatus: getChangeStatus
};

var assert = require('assert'),
    AWS = require('aws-sdk'),
    config = require('../config.js'),
    debug = require('debug')('box:dns/route53'),
    settings = require('../settings.js'),
    SubdomainError = require('../subdomainerror.js'),
    util = require('util'),
    _ = require('underscore');

function getDnsCredentials(callback) {
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        var credentials = {
            accessKeyId: dnsConfig.accessKeyId,
            secretAccessKey: dnsConfig.secretAccessKey,
            region: dnsConfig.region
        };

        if (dnsConfig.endpoint) credentials.endpoint = new AWS.Endpoint(dnsConfig.endpoint);

        callback(null, credentials);
    });
}

function getZoneByName(zoneName, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof callback, 'function');

    getDnsCredentials(function (error, credentials) {
        if (error) return callback(error);

        var route53 = new AWS.Route53(credentials);
        route53.listHostedZones({}, function (error, result) {
            if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, new Error(error)));

            var zone = result.HostedZones.filter(function (zone) {
                return zone.Name.slice(0, -1) === zoneName;     // aws zone name contains a '.' at the end
            })[0];

            if (!zone) return callback(new SubdomainError(SubdomainError.NOT_FOUND, 'no such zone'));

            callback(null, zone);
        });
    });
}

function add(zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    debug('add: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    getZoneByName(zoneName, function (error, zone) {
        if (error) return callback(error);

        var fqdn = config.appFqdn(subdomain);
        var records = values.map(function (v) { return { Value: v }; });

        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        Type: type,
                        Name: fqdn,
                        ResourceRecords: records,
                        Weight: 0,
                        SetIdentifier: fqdn,
                        TTL: 1
                    }
                }]
            },
            HostedZoneId: zone.Id
        };

        getDnsCredentials(function (error, credentials) {
            if (error) return callback(error);

            var route53 = new AWS.Route53(credentials);
            route53.changeResourceRecordSets(params, function(error, result) {
                if (error && error.code === 'PriorRequestNotComplete') {
                    return callback(new SubdomainError(SubdomainError.STILL_BUSY, error.message));
                } else if (error) {
                    return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error.message));
                }

                debug('addSubdomain: success. changeInfoId:%j', result);

                callback(null, result.ChangeInfo.Id);
            });
        });
    });
}

function update(zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    get(zoneName, subdomain, type, function (error, result) {
        if (error) return callback(error);

        if (_.isEqual(values, result)) return callback();

        add(zoneName, subdomain, type, values, callback);
    });
}

function get(zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    getZoneByName(zoneName, function (error, zone) {
        if (error) return callback(error);

        var params = {
            HostedZoneId: zone.Id,
            MaxItems: '1',
            StartRecordName: (subdomain ? subdomain + '.' : '') + zoneName + '.',
            StartRecordType: type
        };

        getDnsCredentials(function (error, credentials) {
            if (error) return callback(error);

            var route53 = new AWS.Route53(credentials);
            route53.listResourceRecordSets(params, function (error, result) {
                if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, new Error(error)));
                if (result.ResourceRecordSets.length === 0) return callback(null, [ ]);
                if (result.ResourceRecordSets[0].Name !== params.StartRecordName && result.ResourceRecordSets[0].Type !== params.StartRecordType) return callback(null, [ ]);

                var values = result.ResourceRecordSets[0].ResourceRecords.map(function (record) { return record.Value; });

                callback(null, values);
            });
        });
    });
}

function del(zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    debug('add: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    getZoneByName(zoneName, function (error, zone) {
        if (error) return callback(error);

        var fqdn = config.appFqdn(subdomain);
        var records = values.map(function (v) { return { Value: v }; });

        var resourceRecordSet = {
            Name: fqdn,
            Type: type,
            ResourceRecords: records,
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

        getDnsCredentials(function (error, credentials) {
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

                callback(null);
            });
        });
    });
}

function getChangeStatus(changeId, callback) {
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (changeId === '') return callback(null, 'INSYNC');

    getDnsCredentials(function (error, credentials) {
        if (error) return callback(error);

        var route53 = new AWS.Route53(credentials);
        route53.getChange({ Id: changeId }, function (error, result) {
            if (error) return callback(error);

            callback(null, result.ChangeInfo.Status);
        });
    });
}
