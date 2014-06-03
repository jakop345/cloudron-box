/* jslint node:true */

'use strict';

var DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    debug = require('debug')('server:apps'),
    assert = require('assert'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    task = require('./apptask.js');

exports = module.exports = {
    AppsError: AppsError,

    initialize: initialize,
    get: get,
    getAll: getAll,
    install: install,
    uninstall: uninstall
};

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

function initialize(config) {
    assert(typeof config.appServerUrl === 'string');
    assert(typeof config.nginxAppConfigDir === 'string');

    task.initialize(config.appServerUrl, config.nginxAppConfigDir);
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

function install(appId, username, password, location, callback) {
    assert(typeof appId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof location === 'string');

    appdb.add(appId, appdb.STATUS_PENDING_INSTALL, location, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError('Already installed or installing', AppsError.ALREADY_EXISTS));
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        debug('Will install app with id : ' + appId);

        task.refresh();

        callback(null);
    });
}

function uninstall(appId, callback) {
    assert(typeof appId === 'string');

    // TODO there is a race here with the task manager updating status
    appdb.update(appId, { statusCode: appdb.STATUS_PENDING_UNINSTALL, statusMessage: '' }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new AppsError('No such app', AppsError.NOT_FOUND));
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        task.refresh();

        callback(null);
    });
}

