'use strict';

exports = module.exports = {
    backupDone: backupDone
};

var assert = require('assert'),
    config = require('./config.js'),
    debug = require('debug')('box:webhooks'),
    superagent = require('superagent'),
    util = require('util');

function backupDone(filename, app, appBackupIds, callback) {
    assert.strictEqual(typeof filename, 'string');
    assert(!app || typeof app === 'object');
    assert(!appBackupIds || util.isArray(appBackupIds));
    assert.strictEqual(typeof callback, 'function');

    debug('backupDone %s', filename);

    // CaaS
    if (config.token()) {
        var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backupDone';
        var data = {
            boxVersion: config.version(),
            restoreKey: filename,
            appId: app ? app.id : null,
            appVersion: app ? app.manifest.version : null,
            appBackupIds: appBackupIds
        };

        superagent.post(url).send(data).query({ token: config.token() }).timeout(30 * 1000).end(function (error, result) {
            if (error && !error.response) return callback(error);
            if (result.statusCode !== 200) return callback(new Error(result.text));
            if (!result.body) return callback(new Error('Unexpected response'));

            return callback(null);
        });
    } else {
        // TODO call custom webhook
        callback(null);
    }
}
