'use strict';

exports = module.exports = {
    upsert: upsert,
    get: get,
    del: del,
    getChangeStatus: getChangeStatus
};

var assert = require('assert'),
    debug = require('debug')('box:dns/noop'),
    SubdomainError = require('../subdomains.js').SubdomainError,
    sysinfo = require('../sysinfo.js'),
    util = require('util');

function upsert(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    debug('upsert: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    return callback();
}

function get(dnsConfig, zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (type !== 'A') return callback(null, [ ]);

    sysinfo.getIp(function (error, ip) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error.message));

        return callback(null, [ ip ]);
    });
}

function del(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    return callback();
}

function getChangeStatus(dnsConfig, changeId, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    callback(null, 'INSYNC');
}
