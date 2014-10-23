'use strict';

var safe = require('safetydance'),
    util = require('util');

exports = module.exports = DatabaseError;

function DatabaseError(reason, info) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    this.message = !info ? reason : (typeof info === 'object' ? JSON.stringify(info) : info);
}
util.inherits(DatabaseError, Error);

DatabaseError.INTERNAL_ERROR = 'Internal error';
DatabaseError.ALREADY_EXISTS = 'Entry already exist';
DatabaseError.NOT_FOUND = 'Record not found';
DatabaseError.RECORD_SCHEMA = 'Record does not match the schema';
