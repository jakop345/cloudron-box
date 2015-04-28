/* jslint node: true */

'use strict';

// intentionally placed here because of circular dep with updater
exports = module.exports = {
    DeveloperError: DeveloperError,

    enabled: enabled,
    setEnabled: setEnabled,
    issueDeveloperToken: issueDeveloperToken
};

var assert = require('assert'),
    tokendb = require('./tokendb.js'),
    config = require('../config.js'),
    util = require('util');

function DeveloperError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
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
util.inherits(DeveloperError, Error);
DeveloperError.INTERNAL_ERROR = 'Internal Error';

function enabled(callback) {
    assert(typeof callback === 'function');

    callback(null, config.developerMode());
}

function setEnabled(enabled, callback) {
    assert(typeof enabled === 'boolean');
    assert(typeof callback === 'function');

    config.set('developerMode', enabled);

    callback(null);
}

function issueDeveloperToken(user, callback) {
    assert(typeof user === 'object');
    assert(typeof callback === 'function');

    var token = tokendb.generateToken();
    var expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 1 day

    tokendb.add(token, tokendb.PREFIX_DEV + user.id, '', expiresAt, 'apps,settings,roleDeveloper', function (error) {
        if (error) return callback(new DeveloperError(DeveloperError.INTERNAL_ERROR, error));

        callback(null, { token: token, expiresAt: expiresAt });
    });
}
