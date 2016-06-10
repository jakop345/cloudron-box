/* jslint node: true */

'use strict';

exports = module.exports = {
    DeveloperError: DeveloperError,

    isEnabled: isEnabled,
    setEnabled: setEnabled,
    issueDeveloperToken: issueDeveloperToken,
    getNonApprovedApps: getNonApprovedApps
};

var assert = require('assert'),
    config = require('./config.js'),
    clients = require('./clients.js'),
    debug = require('debug')('box:developer'),
    eventlog = require('./eventlog.js'),
    tokendb = require('./tokendb.js'),
    settings = require('./settings.js'),
    superagent = require('superagent'),
    util = require('util');

function DeveloperError(reason, errorOrMessage) {
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
util.inherits(DeveloperError, Error);
DeveloperError.INTERNAL_ERROR = 'Internal Error';
DeveloperError.EXTERNAL_ERROR = 'External Error';

function isEnabled(callback) {
    assert.strictEqual(typeof callback, 'function');

    settings.getDeveloperMode(function (error, enabled) {
        if (error) return callback(new DeveloperError(DeveloperError.INTERNAL_ERROR, error));
        callback(null, enabled);
    });
}

function setEnabled(enabled, auditSource, callback) {
    assert.strictEqual(typeof enabled, 'boolean');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    settings.setDeveloperMode(enabled, function (error) {
        if (error) return callback(new DeveloperError(DeveloperError.INTERNAL_ERROR, error));

        eventlog.add(eventlog.ACTION_CLI_MODE, auditSource, { enabled: enabled });

        callback(null);
    });
}

function issueDeveloperToken(user, auditSource, callback) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    var token = tokendb.generateToken();
    var expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 1 day
    var scopes = '*,' + clients.SCOPE_ROLE_SDK;

    tokendb.add(token, user.id, 'cid-cli', expiresAt, scopes, function (error) {
        if (error) return callback(new DeveloperError(DeveloperError.INTERNAL_ERROR, error));

        eventlog.add(eventlog.ACTION_USER_LOGIN, auditSource, { authType: 'cli', userId: user.id, username: user.username });

        callback(null, { token: token, expiresAt: new Date(expiresAt).toISOString() });
    });
}

function getNonApprovedApps(callback) {
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/apps';
    superagent.get(url).query({ token: config.token(), boxVersion: config.version() }).end(function (error, result) {
        if (error && !error.response) return callback(new DeveloperError(DeveloperError.EXTERNAL_ERROR, error));
        if (result.statusCode === 401 || result.statusCode === 403) {
            debug('Failed to list apps in development. Appstore token invalid or missing. Returning empty list.', result.body);
            return callback(null, []);
        }
        if (result.statusCode !== 200) return callback(new DeveloperError(DeveloperError.EXTERNAL_ERROR, util.format('App listing failed. %s %j', result.status, result.body)));

        callback(null, result.body.apps || []);
    });
}
