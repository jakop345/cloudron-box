/* jslint node:true */

'use strict';

var assert = require('assert'),
    util = require('util');

module.exports = exports = DatabaseError;

function DatabaseError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined' || errorOrMessage === null);

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.reason = reason;
    if (typeof errorOrMessage === 'undefined' || errorOrMessage === null) {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(DatabaseError, Error);

DatabaseError.INTERNAL_ERROR = 'Internal error';
DatabaseError.ALREADY_EXISTS = 'Entry already exist';
DatabaseError.NOT_FOUND = 'Record not found';
DatabaseError.BAD_FIELD = 'Invalid field';
