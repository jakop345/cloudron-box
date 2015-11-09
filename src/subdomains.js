/* jslint node:true */

'use strict';

module.exports = exports = {
    add: add,
    remove: remove,
    status: status,
    update: update, // unlike add, this fetches latest value, compares and adds if necessary. atomicity depends on backend
    get: get,

    SubdomainError: SubdomainError
};

var assert = require('assert'),
    caas = require('./dns/caas.js'),
    config = require('./config.js'),
    route53 = require('./dns/route53.js'),
    settings = require('./settings.js'),
    util = require('util');

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
SubdomainError.STILL_BUSY = 'Still busy';
SubdomainError.MISSING_CREDENTIALS = 'Missing credentials';
SubdomainError.INTERNAL_ERROR = 'Missing credentials';

// choose which subdomain backend we use for test purpose we use route53
function api(provider) {
    assert.strictEqual(typeof provider, 'string');

    switch (provider) {
        case 'caas': return caas;
        case 'route53': return route53;
        default: return null;
    }
}

function add(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).add(config.zoneName(), subdomain, type, values, function (error, changeId) {
            if (error) return callback(error);
            callback(null, changeId);
        });
    });
}

function get(subdomain, type, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).get(config.zoneName(), subdomain, type, function (error, values) {
            if (error) return callback(error);

            callback(null, values);
        });
    });
}

function update(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).update(config.zoneName(), subdomain, type, values, function (error) {
            if (error) return callback(error);

            callback(null);
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

        api(dnsConfig.provider).del(config.zoneName(), subdomain, type, values, function (error) {
            if (error && error.reason !== SubdomainError.NOT_FOUND) return callback(error);

            callback(null);
        });
    });
}

function status(changeId, callback) {
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    settings.getDnsConfig(function (error, dnsConfig) {
        if (error) return callback(new SubdomainError(SubdomainError.INTERNAL_ERROR, error));

        api(dnsConfig.provider).getChangeStatus(changeId, function (error, status) {
            if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error));
            callback(null, status === 'INSYNC' ? 'done' : 'pending');
        });
    });
}
