'use strict';

exports = module.exports = {
    SysInfoError: SysInfoError,

    getIp: getIp
};

var assert = require('assert'),
    caas = require('./sysinfo/caas.js'),
    config = require('./config.js'),
    ec2 = require('./sysinfo/ec2.js'),
    generic = require('./sysinfo/generic.js'),
    util = require('util');

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

    switch (config.provider()) {
        case '': return callback(null, caas);   // current fallback for caas
        case 'caas': return callback(null, caas);
        case 'digitalocean': return callback(null, caas);
        case 'ec2': return callback(null, ec2);
        case 'generic': return callback(null, generic);
        default: return callback(new Error('Unknown provider ' + config.provider()));
    }
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
