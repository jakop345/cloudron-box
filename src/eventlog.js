'use strict';

exports = module.exports = {
    EventLogError: EventLogError,

    add: add,
    get: get,
    getAllPaged: getAllPaged,

    ACTION_ACTIVATED: 'box.activated',
    ACTION_APP_CONFIGURING: 'app.configuring',
    ACTION_APP_INSTALLING: 'app.installing',
    ACTION_APP_RESTORING: 'app.restoring',
    ACTION_APP_UNINSTALLING: 'app.uninstalling',
    ACTION_APP_UPDATING: 'app.updating',
    ACTION_BACKUP_STARTED: 'backup.started',
    ACTION_BACKUP_DONE: 'backup.done',
    ACTION_BOX_REBOOT: 'box.reboot',
    ACTION_CLI_MODE: 'settings.climode',
    ACTION_UPDATING: 'box.updating'
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

function add(action, data, callback) {
    assert.strictEqual(typeof action, 'string');
    assert.strictEqual(typeof data, 'object');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

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
