'use strict';

exports = module.exports = {
    add: add,
    del: del,
    get: get,
    getAll: getAll,

    MailboxError: MailboxError
};

var assert = require('assert'),
    DatabaseError = require('./databaseerror.js'),
    mailboxdb = require('./mailboxdb.js'),
    util = require('util');

function MailboxError(reason, errorOrMessage) {
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
util.inherits(MailboxError, Error);
MailboxError.ALREADY_EXISTS = 'already exists';
MailboxError.BAD_NAME = 'bad name';
MailboxError.NOT_FOUND = 'not found';
MailboxError.INTERNAL_ERROR = 'internal error';

function validateName(name) {
    var RESERVED_NAMES = [ 'no-reply', 'postmaster', 'mailer-daemon' ];

    if (name.length < 2) return new MailboxError(MailboxError.BAD_NAME, 'Name too small');
    if (name.length > 127) return new MailboxError(MailboxError.BAD_NAME, 'Name too long');
    if (RESERVED_NAMES.indexOf(name) !== -1) return new MailboxError(MailboxError.BAD_NAME, 'Name is reserved');

    if (/[^a-zA-Z0-9.]/.test(name)) return new MailboxError(MailboxError.BAD_NAME, 'Name can only contain alphanumerals and dot');

    return null;
}

function add(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    name = name.toLowerCase();

    var error = validateName(name);
    if (error) return callback(error);

    mailboxdb.add(name /* id */, name, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new MailboxError(MailboxError.ALREADY_EXISTS));
        if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

        var mailbox = {
            id: name,
            name: name
        };

        callback(null, mailbox);
    });
}

function del(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    mailboxdb.del(id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new MailboxError(MailboxError.NOT_FOUND));
        if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

        callback();
    });
}

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    mailboxdb.get(id, function (error, mailbox) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new MailboxError(MailboxError.NOT_FOUND));
        if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

        callback(null, mailbox);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    mailboxdb.getAll(function (error, results) {
        if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}
