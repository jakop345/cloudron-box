'use strict';

exports = module.exports = {
    upsert: upsert,
    get: get,
    del: del,
    getChangeStatus: getChangeStatus
};

var assert = require('assert'),
    debug = require('debug')('box:dns/digitalocean'),
    SubdomainError = require('../subdomains.js').SubdomainError,
    superagent = require('superagent'),
    util = require('util');

var DIGITALOCEAN_ENDPOINT = 'https://api.digitalocean.com';

function getInternal(dnsConfig, zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    superagent.get(DIGITALOCEAN_ENDPOINT + '/v2/domains/' + zoneName + '/records')
      .set('Authorization', 'Bearer ' + dnsConfig.token)
      .timeout(30 * 1000)
      .end(function (error, result) {
        if (error && !error.response) return callback(error);
        if (result.statusCode !== 200) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.statusCode, result.body)));

        var tmp = result.body.domain_records.filter(function (record) {
            return (record.type === type && record.name === subdomain);
        });

        debug('getInternal: %j', tmp);

        return callback(null, tmp);
    });
}

function upsert(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    subdomain = subdomain || '@';

    debug('upsert: %s for zone %s of type %s with values %j', subdomain, zoneName, type, values);

    getInternal(dnsConfig, zoneName, subdomain, type, function (error, result) {
        if (error) return callback(error);

        // FIXME currently we only support one record!

        var data = {
            type: type,
            name: subdomain,
            data: values[0]
        };

        if (result.length === 0) {
            superagent.post(DIGITALOCEAN_ENDPOINT + '/v2/domains/' + zoneName + '/records')
              .set('Authorization', 'Bearer ' + dnsConfig.token)
              .send(data)
              .timeout(30 * 1000)
              .end(function (error, result) {
                if (error && !error.response) return callback(error);
                if (result.statusCode !== 201) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.statusCode, result.body)));

                return callback(null, 'unused');
            });
        } else {
            superagent.put(DIGITALOCEAN_ENDPOINT + '/v2/domains/' + zoneName + '/records/' + result[0].id)
              .set('Authorization', 'Bearer ' + dnsConfig.token)
              .send(data)
              .timeout(30 * 1000)
              .end(function (error, result) {
                if (error && !error.response) return callback(error);
                if (result.statusCode !== 200) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.statusCode, result.body)));

                return callback(null, 'unused');
            });
        }
    });
}

function get(dnsConfig, zoneName, subdomain, type, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    subdomain = subdomain || '@';

    getInternal(dnsConfig, zoneName, subdomain, type, function (error, result) {
        if (error) return callback(error);

        // We only return the value string
        var tmp = result.map(function (record) { return record.data; });

        debug('get: %j', tmp);

        return callback(null, tmp);
    });
}

function del(dnsConfig, zoneName, subdomain, type, values, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof zoneName, 'string');
    assert.strictEqual(typeof subdomain, 'string');
    assert.strictEqual(typeof type, 'string');
    assert(util.isArray(values));
    assert.strictEqual(typeof callback, 'function');

    subdomain = subdomain || '@';

    getInternal(dnsConfig, zoneName, subdomain, type, function (error, result) {
        if (error) return callback(error);

        if (result.length === 0) return callback(null);

        var tmp = result.filter(function (record) { return values.some(function (value) { return value === record.data; }); });

        debug('del: %j', tmp);

        if (tmp.length === 0) return callback(null);

        // FIXME we only handle the first one currently

        superagent.del(DIGITALOCEAN_ENDPOINT + '/v2/domains/' + zoneName + '/records/' + tmp[0].id)
          .set('Authorization', 'Bearer ' + dnsConfig.token)
          .timeout(30 * 1000)
          .end(function (error, result) {
            if (error && !error.response) return callback(error);
            if (result.statusCode === 404) return callback(null);
            if (result.statusCode !== 204) return callback(new SubdomainError(SubdomainError.EXTERNAL_ERROR, util.format('%s %j', result.statusCode, result.body)));

            debug('del: done');

            return callback(null);
        });
    });
}

function getChangeStatus(dnsConfig, changeId, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof changeId, 'string');
    assert.strictEqual(typeof callback, 'function');

    // Digitalocean does not have any way to check that
    callback(null, 'INSYNC');
}
