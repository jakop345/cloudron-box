/* jslint node: true */

'use strict';

// intentionally placed here because of circular dep with updater
exports = module.exports = {
    DeveloperError: DeveloperError,

    initialize: initialize,
    uninitialize: uninitialize,

    issueDeveloperToken: issueDeveloperToken
};

var assert = require('assert'),
    debug = require('debug')('box:developer'),
    tokendb = require('./tokendb.js'),
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

function initialize(callback) {
    assert(typeof callback === 'function');

    callback(null);
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    callback(null);
}

function issueDeveloperToken(user, callback) {
    assert(typeof user === 'object');
    assert(typeof callback === 'function');

    var token = tokendb.generateToken();
    var expiresAt = Date.now() + 60 * 60000; // 1 hour

    tokendb.add(token, 'dev-' + user.id, '', expiresAt, '*', function (error) {
        if (error) return callback(new DeveloperError(DeveloperError.INTERNAL_ERROR, error));

        callback(null, { token: token, expiresAt: expiresAt });
    });
}
