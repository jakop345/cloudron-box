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

    if (process.env.BOX_ENV === 'test') return callback(null, '127.0.0.1');

    superagent.get('http://169.254.169.254/metadata/v1.json').timeout(30 * 1000).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            console.error('Error getting metadata', error);
            return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));
        }

        // Note that we do not use a floating IP for 3 reasons:
        // The PTR record is not set to floating IP, the outbound interface is not changeable to floating IP
        // and there are reports that port 25 on floating IP is blocked.
        var ip = safe.query(result.body, 'interfaces.public[0].ipv4.ip_address');
        if (!ip) return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found'));

        callback(null, ip);
    });
}
