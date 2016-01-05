/* jslint node:true */

'use strict';

var assert = require('assert'),
    caas = require('./sysinfo/caas.js'),
    config = require('./config.js'),
    ec2 = require('./sysinfo/ec2.js'),
    util = require('util');

exports = module.exports = {
    SysInfoError: SysInfoError,

    getIp: getIp
};

var gCachedIp = null;

function SysInfoError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(SysInfoError, Error);
SysInfoError.INTERNAL_ERROR = 'Internal Error';

function getApi(callback) {
    assert.strictEqual(typeof callback, 'function');

    var api = config.provider() === '' ? caas : ec2;

    callback(null, api);
}

function getIp(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gCachedIp) return callback(null, gCachedIp);

    getApi(function (error, api) {
        if (error) return callback(error);

        api.getIp(function (error, ip) {
            if (error) return callback(error);

            gCachedIp = ip;

            callback(null, gCachedIp);
        });
    });
}
