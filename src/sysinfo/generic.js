'use strict';

exports = module.exports = {
    getIp: getIp
};

var assert = require('assert'),
    async = require('async'),
    config = require('../config.js'),
    superagent = require('superagent'),
    SysInfoError = require('../sysinfo.js').SysInfoError;

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    async.retry({ times: 10, interval: 5000 }, function (callback) {
        superagent.get(config.apiServerOrigin() + '/api/v1/helper/public_ip').timeout(30 * 1000).end(function (error, result) {
            if (error || result.statusCode !== 200) {
                console.error('Error getting IP', error);
                return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'Unable to contact api server'));
            }
            if (!result.body && !result.body.ip) {
                console.error('Unexpected answer. No "ip" found in response body.', result.body);
                return callback(new SysInfoError(SysInfoError.INTERNAL_ERROR, 'No IP found in body'));
            }

            callback(null, result.body.ip);
        });
    }, function (error, result) {
        if (error) return callback(error);

        callback(null, result);
    });
}
