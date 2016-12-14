'use strict';

module.exports = exports = {
    remove: remove,
    upsert: upsert,
    get: get,
    waitForDns: waitForDns,

    SubdomainError: SubdomainError
};

var assert = require('assert'),
    caas = require('./dns/caas.js'),
    config = require('./config.js'),
    digitalocean = require('./dns/digitalocean.js'),
    manualDns = require('./dns/manual.js'),
    route53 = require('./dns/route53.js'),
    settings = require('./settings.js'),
    util = require('util'),
    noopDns = require('./dns/noop.js');

function SubdomainError(reason, errorOrMessage) {
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
util.inherits(SubdomainError, Error);

SubdomainError.NOT_FOUND = 'No such domain';
SubdomainError.EXTERNAL_ERROR = 'External error';
SubdomainError.BAD_FIELD = 'Bad Field';
SubdomainError.STILL_BUSY = 'Still busy';
SubdomainError.MISSING_CREDENTIALS = 'Missing credentials';
SubdomainError.INTERNAL_ERROR = 'Internal error';
SubdomainError.ACCESS_DENIED = 'Access denied';

// choose which subdomain backend we use for test purpose we use route53
function api(provider) {
    assert.strictEqual(typeof provider, 'string');

    switch (provider) {
        case 'caas': return caas;
        case 'route53': return route53;
        case 'digitalocean': return digitalocean;
        case 'manual': return manualDns;
        case 'noop': return noopDns;
        default: return null;
    }
}

function get(subdomain, type, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).get(dnsConfig, config.zoneName(), subdomain, type, function (error, values) {
            if (error) return callback(error);

            callback(null, values);
        });
    });
}

function upsert(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).upsert(dnsConfig, config.zoneName(), subdomain, type, values, function (error, changeId) {
            if (error) return callback(error);

            callback(null, changeId);
        });
    });
}

function remove(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).del(dnsConfig, config.zoneName(), subdomain, type, values, function (error) {
            if (error && error.reason !== SubdomainError.NOT_FOUND) return callback(error);

            callback(null);
        });
    });
}

function waitForDns(domain, value, type, options, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof value, 'string');
    assert(type === 'A' || type === 'CNAME');
    assert(options && typeof options === 'object'); // { interval: 5000, times: 50000 }
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).waitForDns(domain, value, type, options, callback); // FIXME: translate to SubdomainError
    });
}

