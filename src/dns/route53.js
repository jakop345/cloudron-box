'use strict';

exports = module.exports = {
    add: add,
    get: get,
    del: del,
    upsert: upsert,
    getChangeStatus: getChangeStatus,

    // not part of "dns" interface
    getHostedZone: getHostedZone
};

var assert = require('assert'),
    AWS = require('aws-sdk'),
    debug = require('debug')('box:dns/route53'),
    SubdomainError = require('../subdomains.js').SubdomainError,
    util = require('util'),
    _ = require('underscore');

function getDnsCredentials(dnsConfig) {
    assert.strictEqual(typeof dnsConfig, 'object');

    var credentials = {
        accessKeyId: dnsConfig.accessKeyId,
        secretAccessKey: dnsConfig.secretAccessKey,
        region: dnsConfig.region
    };

    if (dnsConfig.endpoint) credentials.endpoint = new AWS.Endpoint(dnsConfig.endpoint);

    return credentials;
}

function getZoneByName(dnsConfig, zoneName, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof callback, 'function');

    var route53 = new AWS.Route53(getDnsCredentials(dnsConfig));
    route53.listHostedZones({}, function (error, result) {
        if (error && error.code === 'AccessDenied') return callback(new SubdomainError(SubdomainError.ACCESS_DENIED, error.message));
        if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error.message));

        var zone = result.HostedZones.filter(function (zone) {
            return zone.Name.slice(0, -1) === zoneName;     // aws zone name contains a '.' at the end
        })[0];

        if (!zone) return callback(new SubdomainError(SubdomainError.NOT_FOUND, 'no such zone'));

        callback(null, zone);
    });
}

function getHostedZone(dnsConfig, zoneName, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof callback, 'function');
 
    getZoneByName(dnsConfig, zoneName, function (error, zone) {
        if (error) return callback(error);

        var route53 = new AWS.Route53(getDnsCredentials(dnsConfig));
        route53.getHostedZone({ Id: zone.Id }, function (error, result) {
            if (error && error.code === 'AccessDenied') return callback(new SubdomainError(SubdomainError.ACCESS_DENIED, error.message));
            if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error.message));

            callback(null, result);
        });
    });
}

function add(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    debug('add: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    getZoneByName(dnsConfig, zoneName, function (error, zone) {
        if (error) return callback(error);

        var fqdn = subdomain === '' ? zoneName : subdomain + '.' + zoneName;
        var records = values.map(function (v) { return { Value: v }; });

        var params = {
            ChangeBatch: {
                Changes: [{
                    Action: 'UPSERT',
                    ResourceRecordSet: {
                        Type: type,
                        Name: fqdn,
                        ResourceRecords: records,
                        TTL: 1
                    }
                }]
            },
            HostedZoneId: zone.Id
        };

        var route53 = new AWS.Route53(getDnsCredentials(dnsConfig));
        route53.changeResourceRecordSets(params, function(error, result) {
            if (error && error.code === 'AccessDenied') return callback(new SubdomainError(SubdomainError.ACCESS_DENIED, error.message));
            if (error && error.code === 'PriorRequestNotComplete') return callback(new SubdomainError(SubdomainError.STILL_BUSY, error.message));
            if (error && error.code === 'InvalidChangeBatch') return callback(new SubdomainError(SubdomainError.BAD_FIELD, error.message));
            if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error.message));

            callback(null, result.ChangeInfo.Id);
        });
    });
}

function upsert(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    add(dnsConfig, zoneName, subdomain, type, values, callback);
}

function get(dnsConfig, zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    getZoneByName(dnsConfig, zoneName, function (error, zone) {
        if (error) return callback(error);

        var params = {
            HostedZoneId: zone.Id,
            MaxItems: '1',
            StartRecordName: (subdomain ? subdomain + '.' : '') + zoneName + '.',
            StartRecordType: type
        };

        var route53 = new AWS.Route53(getDnsCredentials(dnsConfig));
        route53.listResourceRecordSets(params, function (error, result) {
            if (error && error.code === 'AccessDenied') return callback(new SubdomainError(SubdomainError.ACCESS_DENIED, error.message));
            if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error.message));
            if (result.ResourceRecordSets.length === 0) return callback(null, [ ]);
            if (result.ResourceRecordSets[0].Name !== params.StartRecordName || result.ResourceRecordSets[0].Type !== params.StartRecordType) return callback(null, [ ]);

            var values = result.ResourceRecordSets[0].ResourceRecords.map(function (record) { return record.Value; });

            callback(null, values);
        });
    });
}

function del(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    getZoneByName(dnsConfig, zoneName, function (error, zone) {
        if (error) return callback(error);

        var fqdn = subdomain === '' ? zoneName : subdomain + '.' + zoneName;
        var records = values.map(function (v) { return { Value: v }; });

        var resourceRecordSet = {
            Name: fqdn,
            Type: type,
            ResourceRecords: records,
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

        var route53 = new AWS.Route53(getDnsCredentials(dnsConfig));
        route53.changeResourceRecordSets(params, function(error, result) {
            if (error && error.code === 'AccessDenied') return callback(new SubdomainError(SubdomainError.ACCESS_DENIED, error.message));
            if (error && error.message && error.message.indexOf('it was not found') !== -1) {
                debug('del: resource record set not found.', error);
                return callback(new SubdomainError(SubdomainError.NOT_FOUND, error.message));
            } else if (error && error.code === 'NoSuchHostedZone') {
                debug('del: hosted zone not found.', error);
                return callback(new SubdomainError(SubdomainError.NOT_FOUND, error.message));
            } else if (error && error.code === 'PriorRequestNotComplete') {
                debug('del: resource is still busy', error);
                return callback(new SubdomainError(SubdomainError.STILL_BUSY, error.message));
            } else if (error && error.code === 'InvalidChangeBatch') {
                debug('del: invalid change batch. No such record to be deleted.');
                return callback(new SubdomainError(SubdomainError.NOT_FOUND, error.message));
            } else if (error) {
                debug('del: error', error);
                return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error.message));
            }

            callback(null);
        });
    });
}

function getChangeStatus(dnsConfig, changeId, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (changeId === '') return callback(null, 'INSYNC');

    var route53 = new AWS.Route53(getDnsCredentials(dnsConfig));
    route53.getChange({ Id: changeId }, function (error, result) {
        if (error && error.code === 'AccessDenied') return callback(new SubdomainError(SubdomainError.ACCESS_DENIED, error.message));
        if (error) return callback(error);

        callback(null, result.ChangeInfo.Status);
    });
}

