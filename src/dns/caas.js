/* jslint node:true */

'use strict';

exports = module.exports = {
    add: add,
    del: del,
    updateSubdomain: updateSubdomain,
    getChangeStatus: getChangeStatus,
    get: get
};

var assert = require('assert'),
    config = require('../config.js'),
    debug = require('debug')('box:dns/caas'),
    SubdomainError = require('../subdomainerror.js'),
    superagent = require('superagent'),
    util = require('util');

function add(zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    var fqdn = subdomain !== '' && type === 'TXT' ? subdomain + '.' + config.fqdn() : config.appFqdn(subdomain);

    debug('add: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    var data = {
        type: type,
        values: values
    };

    superagent
        .post(config.apiServerOrigin() + '/api/v1/domains/' + fqdn)
        .query({ token: config.token() })
        .send(data)
        .end(function (error, result) {
            if (error) return callback(error);
            if (result.status === 420) return callback(new SubdomainError(SubdomainError.STILL_BUSY));
            if (result.status !== 201) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            return callback(null, result.body.changeId);
        });
}

function get(zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    var fqdn = subdomain !== '' && type === 'TXT' ? subdomain + '.' + config.fqdn() : config.appFqdn(subdomain);

    debug('get: zoneName: %s subdomain: %s type: %s fqdn: %s', zoneName, subdomain, type, fqdn);

    superagent
        .get(config.apiServerOrigin() + '/api/v1/domains/' + fqdn)
        .query({ token: config.token(), type: type })
        .end(function (error, result) {
            if (error) return callback(error);
            if (result.status !== 200) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            return callback(null, result.body.values);
        });
}

function updateSubdomain(zoneName, subdomain, type, value, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(typeof callback, 'function');

    get(zoneName, subdomain, type, function (error, values) {
        if (error) return callback(error);

        if (values[0] === value) return callback();

        add(zoneName, subdomain, type, value, callback);
    });
}

function del(zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    debug('add: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    var data = {
        type: type,
        values: values
    };

    superagent
        .del(config.apiServerOrigin() + '/api/v1/domains/' + config.appFqdn(subdomain))
        .query({ token: config.token() })
        .send(data)
        .end(function (error, result) {
            if (error) return callback(error);
            if (result.status === 420) return callback(new SubdomainError(SubdomainError.STILL_BUSY));
            if (result.status === 404) return callback(new SubdomainError(SubdomainError.NOT_FOUND));
            if (result.status !== 204) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            return callback(null);
        });
}

function getChangeStatus(changeId, callback) {
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (changeId === '') return callback(null, 'INSYNC');

    superagent
        .get(config.apiServerOrigin() + '/api/v1/domains/' + config.fqdn() + '/status/' + changeId)
        .query({ token: config.token() })
        .end(function (error, result) {
            if (error) return callback(error);
            if (result.status !== 200) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

            return callback(null, result.body.status);
        });

}
