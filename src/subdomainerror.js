/* jslint node:true */

'use strict';

var assert = require('assert'),
    util = require('util');

exports = module.exports = SubdomainError;

function SubdomainError(reason, errorOrMessage) {
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
util.inherits(SubdomainError, Error);

SubdomainError.NOT_FOUND = 'No such domain';
SubdomainError.EXTERNAL_ERROR = 'External error';
SubdomainError.STILL_BUSY = 'Still busy';
SubdomainError.MISSING_CREDENTIALS = 'Missing credentials';
