/* jslint node:true */

'use strict';

exports = module.exports = DatabaseError;

var assert = require('assert'),
    util = require('util');

function DatabaseError(reason, errorOrMessage) {
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
util.inherits(DatabaseError, Error);

DatabaseError.INTERNAL_ERROR = 'Internal error';
DatabaseError.ALREADY_EXISTS = 'Entry already exist';
DatabaseError.NOT_FOUND = 'Record not found';
DatabaseError.BAD_FIELD = 'Invalid field';
DatabaseError.IN_USE = 'In Use';
