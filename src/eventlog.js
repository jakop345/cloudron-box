'use strict';

exports = module.exports = {
    EventLogError: EventLogError,

    add: add,
    get: get,
    getAllPaged: getAllPaged,

    ACTION_ACTIVATE: 'cloudron.activate',
    ACTION_APP_CONFIGURE: 'app.configure',
    ACTION_APP_INSTALL: 'app.install',
    ACTION_APP_RESTORE: 'app.restore',
    ACTION_APP_UNINSTALL: 'app.uninstall',
    ACTION_APP_UPDATE: 'app.update',
    ACTION_BACKUP: 'cloudron.backup',
    ACTION_CLI_MODE: 'settings.climode',
    ACTION_PROFILE: 'user.profile',
    ACTION_REBOOT: 'cloudron.reboot',
    ACTION_UPDATE: 'cloudron.update',
    ACTION_USER_ADD: 'user.add',
    ACTION_USER_REMOVE: 'user.remove',
    ACTION_USER_UPDATE: 'user.update'
};

var assert = require('assert'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:eventlog'),
    eventlogdb = require('./eventlogdb.js'),
    util = require('util'),
    uuid = require('node-uuid');

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

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
EventLogError.NOT_FOUND = 'Not Found';

function add(action, req, data, callback) {
    assert.strictEqual(typeof action, 'string');
    assert.strictEqual(typeof req, 'object');
    assert.strictEqual(typeof data, 'object');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    var id = uuid.v4();
    var source = { ip: req.headers['x-forwarded-for'] || req.ip || null, username: req.user ? req.user.username : null };

    eventlogdb.add(id, action, source, data, function (error) {
        if (error) return callback(new EventLogError(EventLogError.INTERNAL_ERROR, error));

        callback(null, { id: id });
    });
}

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    eventlogdb.get(id, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new EventLogError(EventLogError.NOT_FOUND, 'No such event'));
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
