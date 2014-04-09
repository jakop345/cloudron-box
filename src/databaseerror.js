'use strict';

var util = require('util'),
    safe = require('safetydance');

exports = module.exports = DatabaseError;

function DatabaseError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = safe.JSON.stringify(err);
    this.code = err ? err.code : null;
    this.reason = reason || DatabaseError.INTERNAL_ERROR;
}
util.inherits(DatabaseError, Error);

DatabaseError.INTERNAL_ERROR = 'Internal error';
DatabaseError.ALREADY_EXISTS = 'Entry already exist';
DatabaseError.NOT_FOUND = 'Record not found';
DatabaseError.RECORD_SCHEMA = 'Record does not match the schema';
