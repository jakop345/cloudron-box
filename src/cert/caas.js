'use strict';

exports = module.exports = {
    getCertificate: getCertificate
};

var assert = require('assert'),
	debug = require('debug')('box:cert/caas.js');

function getCertificate(domain, callback) {
	assert.strictEqual(typeof domain, 'string');
	assert.strictEqual(typeof callback, 'function');

    debug('getCertificate: using fallback certificate', domain);

    return callback(null, 'cert/host.cert', 'cert/host.key');
}
