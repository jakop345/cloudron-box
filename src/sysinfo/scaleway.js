'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    superagent = require('superagent');

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    superagent.get('http://169.254.42.42/conf').timeout(30 * 1000).end(function (error, result) {
        if (error) return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, error.status ? 'Request failed: ' + error.status : 'Network failure'));
        if (result.statusCode !== 200) return callback(new SysInfoError(SysInfoError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

        var kv = result.text.split('\n').filter(function (line) { return line.startsWith('PUBLIC_IP_ADDRESS='); });
        if (kv.length !== 1) return callback(new SysInfoError(SysInfoError.EXTERNAL_ERROR, util.format('%s %j', result.status, result.body)));

        callback(null, kv[0].split('=')[1]);
    });
}

