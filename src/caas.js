/* jslint node:true */

'use strict';

exports = module.exports = {
    addSubdomain: addSubdomain,
    delSubdomain: delSubdomain,
    getChangeStatus: getChangeStatus
};

var assert = require('assert'),
    config = require('./config.js'),
    debug = require('debug')('box:caas'),
    SubdomainError = require('./subdomainerror.js'),
    superagent = require('superagent'),
    util = require('util');

function addSubdomain(zoneName, subdomain, type, value, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(typeof callback, 'function');

    var fqdn = subdomain !== '' && type === 'TXT' ? subdomain + '.' + config.fqdn() : config.appFqdn(subdomain);

    debug('addSubdomain: zoneName: %s subdomain: %s type: %s value: %s fqdn: %s', zoneName, subdomain, type, value, fqdn);

    var data = {
        type: type,
        value: value
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

function delSubdomain(zoneName, subdomain, type, value, callback) {
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('delSubdomain: %s for domain %s.', subdomain, zoneName);

    var data = {
        type: type,
        value: value
    };

    superagent
        .del(config.apiServerOrigin() + '/api/v1/domains/' + config.appFqdn(subdomain))
        .query({ token: config.token() })
        .send(data)
        .end(function (error, result) {
            if (error) return callback(error);
            if (result.status === 420) return callback(new SubdomainError(SubdomainError.STILL_BUSY));
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
