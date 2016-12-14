'use strict';

exports = module.exports = {
    upsert: upsert,
    get: get,
    del: del,
    waitForDns: waitForDns
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

    return callback(null, 'noop-record-id');
}

function get(dnsConfig, zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    callback(null, [ ]); // returning ip confuses apptask into thinking the entry already exists
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

function waitForDns(domain, value, type, options, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof value, 'string');
    assert(type === 'A' || type === 'CNAME');
    assert(options && typeof options === 'object'); // { interval: 5000, times: 50000 }
    assert.strictEqual(typeof callback, 'function');

    callback();
}


