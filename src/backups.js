'use strict';

exports = module.exports = {
    BackupsError: BackupsError,

    getAllPaged: getAllPaged,

    getBackupUrl: getBackupUrl,
    getRestoreUrl: getRestoreUrl
};

var assert = require('assert'),
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

function getBackupUrl(app, appBackupIds, callback) {
    assert(!app || typeof app === 'object');
    assert(!appBackupIds || util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    // TODO get the bucket information form config.js and construct the url
    var obj = {
        id: util.format('backup_%s-v%s.tar.gz', (new Date()).toISOString(), config.version()),
        url: 'https://' + config.aws().backupBucket + '/todo_keypath',
        backupKey: config.backupKey
    };

    debug('getBackupUrl: ', obj);

    callback(null, obj);
}

function getRestoreUrl(backupId, callback) {
    assert.strictEqual(typeof backupId, 'string');
    assert.strictEqual(typeof callback, 'function');

    var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/restoreurl';

    superagent.put(url).query({ token: config.token(), backupId: backupId }).end(function (error, result) {
        if (error) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, error));
        if (result.statusCode !== 201) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, result.text));
        if (!result.body || !result.body.url) return callback(new BackupsError(BackupsError.EXTERNAL_ERROR, 'Unexpected response'));

        return callback(null, result.body);
    });
}


