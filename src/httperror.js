'use strict';

var assert = require('assert'),
    util = require('util');

module.exports = HttpError;

function HttpError(statusCode, errorOrMessage) {
    assert(typeof statusCode === 'number');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.status = statusCode;
    if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.internalError = errorOrMessage;
    }
}
util.inherits(HttpError, Error);
