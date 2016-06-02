'use strict';

exports = module.exports = {
    add: add,
    del: del,
    get: get,
    getAll: getAll,
    setAliases: setAliases,
    getAliases: getAliases,

    setupAliases: setupAliases,

    MailboxError: MailboxError
};

var assert = require('assert'),
    async = require('async'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:mailboxes'),
    docker = require('./docker.js'),
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
MailboxError.EXTERNAL_ERROR = 'external error';

function validateName(name) {
    var RESERVED_NAMES = [ 'no-reply', 'postmaster', 'mailer-daemon' ];

    if (name.length < 2) return new MailboxError(MailboxError.BAD_NAME, 'Name too small');
    if (name.length > 127) return new MailboxError(MailboxError.BAD_NAME, 'Name too long');
    if (RESERVED_NAMES.indexOf(name) !== -1) return new MailboxError(MailboxError.BAD_NAME, 'Name is reserved');

    if (/[^a-zA-Z0-9.]/.test(name)) return new MailboxError(MailboxError.BAD_NAME, 'Name can only contain alphanumerals and dot');

    if (name.indexOf('.app') !== -1) return new MailboxError(MailboxError.BAD_USERNAME, 'Alias pattern is reserved for apps');

    return null;
}

function add(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    name = name.toLowerCase();

    var error = validateName(name);
    if (error) return callback(error);

    mailboxdb.add(name, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new MailboxError(MailboxError.ALREADY_EXISTS));
        if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

        debug('Added mailbox %s', name);

        var mailbox = {
            name: name
        };

        callback(null, mailbox);
    });
}

function pushAlias(name, aliases, callback) {
    if (process.env.BOX_ENV === 'test') return callback();

    var cmd = [ '/addons/mail/service.sh', 'set-alias', name ].concat(aliases);

    debug('pushing alias for %s : %j', name, aliases);

    docker.execContainer('mail', cmd, { }, function (error) {
        if (error) return callback(new MailboxError(MailboxError.EXTERNAL_ERROR, error));

        callback();
    });
}

function del(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    pushAlias(name, [ ], function (error) {
        if (error) return callback(error);

        mailboxdb.del(name, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new MailboxError(MailboxError.NOT_FOUND));
            if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

            debug('deleted mailbox %s', name);

            callback();
        });
    });
}

function get(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    mailboxdb.get(name, function (error, mailbox) {
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

function setAliases(name, aliases, callback) {
    assert.strictEqual(typeof name, 'string');
    assert(util.isArray(aliases));
    assert.strictEqual(typeof callback, 'function');

    for (var i = 0; i < aliases.length; i++) {
        aliases[i] = aliases[i].toLowerCase();

        var error = validateName(aliases[i]);
        if (error) return callback(error);
    }

    pushAlias(name, aliases, function (error) {
        if (error) return callback(error);

        mailboxdb.setAliases(name, aliases, function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new MailboxError(MailboxError.ALREADY_EXISTS, error.message))
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new MailboxError(MailboxError.NOT_FOUND));
            if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));


            callback(null);
        });
    });
}

function getAliases(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    mailboxdb.getAliases(name, function (error, aliases) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new MailboxError(MailboxError.NOT_FOUND));
        if (error) return callback(new MailboxError(MailboxError.INTERNAL_ERROR, error));

        callback(null, aliases);
    });
}

// push aliases to the mail container on startup
function setupAliases(callback) {
    assert.strictEqual(typeof callback, 'function');

    getAll(function (error, mailboxes) {
        if (error) return callback(error);

        async.each(mailboxes, function (mailbox, iteratorDone) {
            getAliases(mailbox.name, function (error, aliases) {
                if (error) return iteratorDone(error);

                if (aliases.length === 0) return iteratorDone();

                pushAlias(mailbox.name, aliases, iteratorDone);
            });
        }, callback)
    });
}

