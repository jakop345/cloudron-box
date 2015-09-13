/* jslint node:true */

'use strict';

var assert = require('assert'),
    async = require('async'),
    aws = require('./aws.js'),
    caas = require('./caas.js'),
    config = require('./config.js'),
    debug = require('debug')('box:subdomains'),
    util = require('util'),
    SubdomainError = require('./subdomainerror.js');

module.exports = exports = {
    add: add,
    addMany: addMany,
    remove: remove,
    status: status
};

// choose which subdomain backend we use
// for test purpose we use aws
function api() {
    return config.token() && !config.TEST ? caas : aws;
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

function addMany(records, callback) {
    assert(util.isArray(records));
    assert.strictEqual(typeof callback, 'function');

    debug('addMany: ', records);

    var changeIds = [];

    async.eachSeries(records, function (record, callback) {
        add(record, function (error, changeId) {
            if (error) return callback(error);

            changeIds.push(changeId);

            callback(null);
        });
    }, function (error) {
        if (error) return callback(error);
        callback(null, changeIds);
    });
}

function remove(record, callback) {
    assert.strictEqual(typeof record, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('remove: ', record);

    api().delSubdomain(config.zoneName(), record.subdomain, record.type, record.value, function (error) {
        if (error && error.reason !== SubdomainError.NOT_FOUND) return callback(error);

        debug('deleteSubdomain: successfully deleted subdomain from aws.');

        callback(null);
    });
}

function status(changeId, callback) {
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('status: ', changeId);

    api().getChangeStatus(changeId, function (error, status) {
        if (error) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, error));
        callback(null, status === 'INSYNC' ? 'done' : 'pending');
    });
}
