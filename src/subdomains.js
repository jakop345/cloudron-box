/* jslint node:true */

'use strict';

var assert = require('assert'),
    caas = require('./dns/caas.js'),
    config = require('./config.js'),
    debug = require('debug')('box:subdomains'),
    route53 = require('./dns/route53.js'),
    SubdomainError = require('./subdomainerror.js');

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

function add(record, callback) {
    assert.strictEqual(typeof record, 'object');
    assert.strictEqual(typeof record.subdomain, 'string');
    assert.strictEqual(typeof record.type, 'string');
    assert.strictEqual(typeof record.value, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('add: ', record);

    api().addSubdomain(config.zoneName(), record.subdomain, record.type, record.value, function (error, changeId) {
        if (error) return callback(error);
        callback(null, changeId);
    });
}

function get(subdomain, type, callback) {
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    api().getSubdomain(config.zoneName(), subdomain, type, function (error, values) {
        if (error) return callback(error);

        callback(null, values);
    });
}

function update(record, callback) {
    assert.strictEqual(typeof record, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('update: ', record);

    api().updateSubdomain(config.zoneName(), record.subdomain, record.type, record.value, function (error) {
        if (error) return callback(error);

        debug('updateSubdomain: successfully updated subdomain %j', record);

        callback(null);
    });
}

function remove(record, callback) {
    assert.strictEqual(typeof record, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('remove: ', record);

    api().delSubdomain(config.zoneName(), record.subdomain, record.type, record.value, function (error) {
        if (error && error.reason !== SubdomainError.NOT_FOUND) return callback(error);

        debug('deleteSubdomain: successfully deleted %j', record);

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
