'use strict';

exports = module.exports = {
    getCertificate: getCertificate,

    // testing
    _name: 'fallback'
};

var assert = require('assert'),
    debug = require('debug')('box:cert/fallback.js');

function getCertificate(domain, options, callback) {
    assert.strictEqual(typeof domain, 'string');
    assert.strictEqual(typeof options, 'object');
    assert.strictEqual(typeof callback, 'function');

    debug('getCertificate: using fallback certificate', domain);

    return callback(null, 'cert/host.cert', 'cert/host.key');
}
