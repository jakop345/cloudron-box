'use strict';

exports = module.exports = {
    EventLogError: EventLogError,

    add: add,
    get: get,
    getAllPaged: getAllPaged,
    cleanup: cleanup,

    // keep in sync with webadmin index.js filter
    ACTION_ACTIVATE: 'cloudron.activate',
    ACTION_APP_CLONE: 'app.clone',
    ACTION_APP_CONFIGURE: 'app.configure',
    ACTION_APP_INSTALL: 'app.install',
    ACTION_APP_RESTORE: 'app.restore',
    ACTION_APP_UNINSTALL: 'app.uninstall',
    ACTION_APP_UPDATE: 'app.update',
    ACTION_BACKUP_FINISH: 'backup.finish',
    ACTION_BACKUP_START: 'backup.start',
    ACTION_CERTIFICATE_RENEWAL: 'certificate.renew',
    ACTION_CLI_MODE: 'settings.climode',
    ACTION_START: 'cloudron.start',
    ACTION_UPDATE: 'cloudron.update',
    ACTION_USER_ADD: 'user.add',
    ACTION_USER_LOGIN: 'user.login',
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

function add(action, source, data, callback) {
    assert.strictEqual(typeof action, 'string');
    assert.strictEqual(typeof source, 'object');
    assert.strictEqual(typeof data, 'object');
    assert(!callback || typeof callback === 'function');

    callback = callback || NOOP_CALLBACK;

    var id = uuid.v4();

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

function getAllPaged(action, search, page, perPage, callback) {
    assert(typeof action === 'string' || action === null);
    assert(typeof search === 'string' || search === null);
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    eventlogdb.getAllPaged(action, search, page, perPage, function (error, boxes) {
        if (error) return callback(new EventLogError(EventLogError.INTERNAL_ERROR, error));

        callback(null, boxes);
    });
}

function cleanup(callback) {
    callback = callback || NOOP_CALLBACK;

    var d = new Date();
    d.setDate(d.getDate() - 7); // 7 days ago

    // only cleanup high frequency events
    var actions = [
        exports.ACTION_USER_LOGIN,
        exports.ACTION_BACKUP_START,
        exports.ACTION_BACKUP_FINISH
    ];

    eventlogdb.delByCreationTime(d, actions, function (error) {
        if (error) return callback(new EventLogError(EventLogError.INTERNAL_ERROR, error));

        callback(null);
    });
}
