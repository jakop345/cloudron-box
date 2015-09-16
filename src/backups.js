'use strict';

exports = module.exports = {
    BackupsError: BackupsError,

    getAllPaged: getAllPaged,

    getBackupUrl: getBackupUrl,
    getRestoreUrl: getRestoreUrl
};

var assert = require('assert'),
    aws = require('./aws.js'),
    config = require('./config.js'),
    debug = require('debug')('box:backups'),
    superagent = require('superagent'),
    util = require('util');

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
BackupsError.INTERNAL_ERROR = 'internal error';

function getAllPaged(page, perPage, callback) {
    assert.strictEqual(typeof page, 'number');
    assert.strictEqual(typeof perPage, 'number');
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backups';

    superagent.get(url).query({ token: config.token() }).end(function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));
        if (result.statusCode !== 200) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, result.text));
        if (!result.body || !util.isArray(result.body.backups)) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, 'Unexpected response'));

        // [ { creationTime, boxVersion, restoreKey, dependsOn: [ ] } ] sorted by time (latest first)
        return callback(null, result.body.backups);
    });
}

function getBackupUrl(app, callback) {
    assert(!app || typeof app === 'object');
    assert.strictEqual(typeof callback, 'function');

    var filename = '';
    if (app) {
        filename = util.format('appbackup_%s_%s-v%s.tar.gz', app.id, (new Date()).toISOString(), app.manifest.version);
    } else {
        filename = util.format('backup_%s-v%s.tar.gz', (new Date()).toISOString(), config.version());
    }

    aws.getSignedUploadUrl(filename, function (error, result) {
        if (error) return callback(error);

        var obj = {
            id: filename,
            url: result.url,
            sessionToken: result.sessionToken,
            backupKey: config.backupKey()
        };

        debug('getBackupUrl: id:%s url:%s sessionToken:%s backupKey:%s', obj.id, obj.url, obj.sessionToken, obj.backupKey);

        callback(null, obj);
    });
}

// backupId is the s3 filename. appbackup_%s_%s-v%s.tar.gz
function getRestoreUrl(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    aws.getSignedDownloadUrl(backupId, function (error, result) {
        if (error) return callback(error);

        var obj = {
            id: backupId,
            url: result.url,
            sessionToken: result.sessionToken,
            backupKey: config.backupKey()
        };

        debug('getRestoreUrl: id:%s url:%s sessionToken:%s backupKey:%s', obj.id, obj.url, obj.sessionToken, obj.backupKey);

        callback(null, obj);
    });
}
