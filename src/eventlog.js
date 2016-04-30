'use strict';

exports = module.exports = {
    EventLogError: EventLogError,

    add: add,
    get: get,
    getAllPaged: getAllPaged
};

var assert = require('assert'),
    DatabaseError = require('./databaseerror.js'),
    eventlogdb = require('./eventlogdb.js'),
    util = require('util'),
    uuid = require('node-uuid');

function EventLogError(reason, errorOrMessage) {
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
util.inherits(EventLogError, Error);
EventLogError.INTERNAL_ERROR = 'Internal error';

function add(action, data, callback) {
    assert.strictEqual(typeof action, 'string');
    assert.strictEqual(typeof data, 'object');
    assert.strictEqual(typeof callback, 'function');

    eventlogdb.add(uuid.v4(), action, data, function (error) {
        if (error) return callback(new EventLogError(EventLogError.INTERNAL_ERROR, error));

        callback();
    });
}

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    eventlogdb.get(id, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new EventLogError(EventLogError.NOT_FOUND, 'No such box'));
        if (error) return callback(new EventLogError(EventLogError.INTERNAL_ERROR, error));

        callback(null, result);
    });
}

function getAllPaged(page, perPage, callback) {
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    eventlogdb.getAllPaged(page, perPage, function (error, boxes) {
        if (error) return callback(new EventLogError(EventLogError.INTERNAL_ERROR, error));

        callback(null, boxes);
    });
}
