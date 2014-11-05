/* jslint node:true */

'use strict';

var assert = require('assert'),
    util = require('util');

module.exports = exports = DatabaseError;

function DatabaseError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.internalError = errorOrMessage;
    }
}
util.inherits(DatabaseError, Error);

DatabaseError.INTERNAL_ERROR = 'Internal error';
DatabaseError.ALREADY_EXISTS = 'Entry already exist';
DatabaseError.NOT_FOUND = 'Record not found';
DatabaseError.RECORD_SCHEMA = 'Record does not match the schema';
