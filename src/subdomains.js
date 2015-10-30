/* jslint node:true */

'use strict';

var assert = require('assert'),
    caas = require('./dns/caas.js'),
    config = require('./config.js'),
    route53 = require('./dns/route53.js'),
    SubdomainError = require('./subdomainerror.js'),
    util = require('util');

module.exports = exports = {
    add: add,
    remove: remove,
    status: status,
    update: update,
    get: get
};

// choose which subdomain backend we use for test purpose we use route53
function api() {
    return config.isCustomDomain() || config.TEST ? route53 : caas;
}

function add(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    api().add(config.zoneName(), subdomain, type, values, function (error, changeId) {
        if (error) return callback(error);
        callback(null, changeId);
    });
}

function get(subdomain, type, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    api().get(config.zoneName(), subdomain, type, function (error, values) {
        if (error) return callback(error);

        callback(null, values);
    });
}

function update(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    api().update(config.zoneName(), subdomain, type, values, function (error) {
        if (error) return callback(error);

        callback(null);
    });
}

function remove(subdomain, type, values, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    api().del(config.zoneName(), subdomain, type, values, function (error) {
        if (error && error.reason !== SubdomainError.NOT_FOUND) return callback(error);

        callback(null);
    });
}

function status(changeId, callback) {
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    api().getChangeStatus(changeId, function (error, status) {
        if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error));
        callback(null, status === 'INSYNC' ? 'done' : 'pending');
    });
}
