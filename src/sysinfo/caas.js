'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    superagent = require('superagent'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    superagent.get('http://169.254.169.254/metadata/v1.json').end(function (error, result) {
        if (error || result.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));
        }

        if (!result.body.floating_ip || !result.body.floating_ip.ipv4 || !result.body.floating_ip.ipv4.ip_address) return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));

        callback(null, result.body.floating_ip.ipv4.ip_address);
    });
}
