'use strict';

// -------------------------------------------
//  This file just describes the interface
//
//  New backends can start from here
// -------------------------------------------

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert');

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    callback(new Error('not implemented'));
}

