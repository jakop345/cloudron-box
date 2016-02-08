/* jshint node:true */

'use strict';

exports = module.exports = {
    GroupError: GroupError,

    create: create,
    remove: remove,
    get: get
};

var assert = require('assert'),
    DatabaseError = require('./databaseerror.js'),
    groupdb = require('./groupdb.js'),
    util = require('util'),
    _ = require('underscore');

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function GroupError(reason, errorOrMessage) {
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
util.inherits(GroupError, Error);
GroupError.INTERNAL_ERROR = 'Internal Error';
GroupError.ALREADY_EXISTS = 'Already Exists';
GroupError.NOT_FOUND = 'Not Found';
GroupError.BAD_NAME = 'Bad name';

function validateGroupname(name) {
    assert.strictEqual(typeof name, 'string');

    if (name.length <= 2) return new GroupError(GroupError.BAD_NAME, 'name must be atleast 3 chars');
    if (name.length >= 255) return new GroupError(GroupError.BAD_NAME, 'name too long');

    return null;
}

function create(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateGroupname(name);
    if (error) return callback(error);

    groupdb.add(name /* id */, name, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new GroupError(GroupError.ALREADY_EXISTS));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function remove(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.del(id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    groupdb.get(id, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new GroupError(GroupError.NOT_FOUND));
        if (error) return callback(new GroupError(GroupError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

