'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'Not implemented'));
}
