'use strict';

// -------------------------------------------
//  This file just describes the interface
//
//  New backends can start from here
// -------------------------------------------

exports = module.exports = {
    getCertificate: getCertificate
};

var assert = require('assert');

function getCertificate(domain, options, callback) {
	assert.strictEqual(typeof domain, 'string');
	assert.strictEqual(typeof options, 'object');
	assert.strictEqual(typeof callback, 'function');

    return callback(new Error('Not implemented'));
}

