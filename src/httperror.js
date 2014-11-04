'use strict';

var assert = require('assert'),
    safe = require('safetydance'),
    util = require('util');

module.exports = HttpError;

function HttpError(statusCode, errorOrMessage) {
    assert(util.isError(errorOrMessage) || typeof errorOrMessage === 'string');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.status = statusCode;
    if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.internalError = error;
    }
}
util.inherits(HttpError, Error);
