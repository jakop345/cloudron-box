/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    debug = require('debug')('box:apps'),
    assert = require('assert'),
    safe = require('safetydance'),
    appdb = require('./appdb.js');

exports = module.exports = {
    AppsError: AppsError,

    initialize: initialize,
    get: get,
    getAll: getAll,
    install: install,
    uninstall: uninstall
};

var task = null;

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function AppsError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = safe.JSON.stringify(err);
    this.code = err ? err.code : null;
    this.reason = reason || AppsError.INTERNAL_ERROR;
}
util.inherits(AppsError, Error);
AppsError.INTERNAL_ERROR = 1;
AppsError.ALREADY_EXISTS = 2;
AppsError.NOT_FOUND = 3;

function initialize(appTask) {
    assert(typeof appTask === 'object'); // ChildProcess

    task = appTask;
}

function get(appId, callback) {
    assert(typeof appId === 'string');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError('No such app', AppsError.NOT_FOUND));
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        callback(null, app);
    });
}

function getAll(callback) {
    appdb.getAll(function (error, apps) {
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));
        callback(null, apps);
    });
}

function install(appId, username, password, location, portBindings, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof location === 'string');

    appdb.add(appId, appdb.STATUS_PENDING_INSTALL, location, portBindings, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError('Already installed or installing', AppsError.ALREADY_EXISTS));
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        debug('Will install app with id : ' + appId);

        task.send({ cmd: 'refresh' });

        callback(null);
    });
}

function uninstall(appId, callback) {
    assert(typeof appId === 'string');

    appdb.get(appId, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError('No such app', AppsError.NOT_FOUND));
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        task.send({ cmd: 'uninstall', appId: appId });
        callback(null);
    });
}

