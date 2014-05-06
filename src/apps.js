'use strict';

var DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    debug = require('debug')('server:app'),
    assert = require('assert'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    superagent = require('superagent');

exports = module.exports = {
    AppsError: AppsError,

    initialize: initialize,
    install: install
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

var STATUS_PENDING = 'pending';

var appServerUrl = null;

function initialize(config) {
    appServerUrl = config.appServerUrl;
}

function installTask() {
    appdb.getAll(function (error, apps) {
        if (error) {
            debug('Error reading apps table ' + error);
            return;
        }

        apps.forEach(function (app) {
            if (app.status === 'Installed') return;

            superagent
                .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
                .set('Accept', 'application/x-yaml')
                .end(function (err, res) {
                    console.log(err);
                    console.log(res);
                    res.pipe(process.stdout);
                    // TODO: change status to Downloaded/Error
                    // TODO: actually install the app
            });
        });
    });
}

function install(appId, callback) {
    appdb.add(appId, { status: STATUS_PENDING }, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new AppsError('Already installed or installing', AppsError.ALREADY_EXISTS));
        if (error) return callback(new AppsError('Internal error:' + error.message, AppsError.INTERNAL_ERROR));

        process.nextTick(installTask);

        callback(null);
    });
}

