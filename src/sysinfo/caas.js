'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    superagent = require('superagent'),
    safe = require('safetydance'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    superagent.get('http://169.254.169.254/metadata/v1.json').end(function (error, result) {
        if (error || result.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));
        }

        // first try to get the floating ip
        var ip = safe.query(result.body, 'floating_ip.ipv4.ip_address');
        if (!ip) ip = safe.query(result.body, 'interfaces.public[0].ipv4.ip_address');
        if (!ip) return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));

        callback(null, ip);
    });
}
