'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    os = require('os'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    try {
        var ip = os.networkInterfaces().eth0[0].address;
        return callback(null, ip);
    } catch (e) {
        return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, e));
    }
}

