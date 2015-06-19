'use strict';

var assert = require('assert'),
    util = require('util'),
    config = require('../config.js'),
    cloudron = require('./cloudron.js'),
    superagent = require('superagent'),
    util = require('util');

exports = module.exports = {
    BackupsError: BackupsError,

    getAll: getAll,
    scheduleBackup: scheduleBackup,

    getBackupUrl: getBackupUrl,
    getRestoreUrl: getRestoreUrl
};

function BackupsError(reason, errorOrMessage) {
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
util.inherits(BackupsError, Error);
BackupsError.EXTERNAL_ERROR = 'external error';

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backups';

    superagent.get(url).query({ token: config.token() }).end(function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));
        if (result.statusCode !== 200) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, result.text));

        // [ { creationTime, boxVersion, restoreKey, dependsOn: [ ] } ] sorted by time (latest first)
        return callback(null, result.body.backups);
    });
}

function scheduleBackup(callback) {
    assert.strictEqual(typeof callback, 'function');

    cloudron.backup(function (error) {
        if (error) console.error('backup failed.', error);
    });

    // we just schedule the backup but do not wait for the result
    callback(null);
}

function getBackupUrl(app, appBackupIds, callback) {
    assert(!app || typeof app === 'object');
    assert(!appBackupIds || util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backupurl';

    var data = {
        boxVersion: config.version(),
        appId: app ? app.id : null,
        appVersion: app ? app.manifest.version : null,
        appBackupIds: appBackupIds
    };

    superagent.put(url).query({ token: config.token() }).send(data).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned backup url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned backup url : ' + result.statusCode));

        return callback(null, result.body);
    });
}

function getRestoreUrl(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/restoreurl';

    superagent.put(url).query({ token: config.token(), backupId: backupId }).end(function (error, result) {
        if (error) return callback(new Error('Error getting presigned download url: ' + error.message));

        if (result.statusCode !== 201 || !result.body || !result.body.url) return callback(new Error('Error getting presigned download url : ' + result.statusCode));

        return callback(null, result.body);
    });
}


