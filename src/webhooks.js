/* jslint node:true */

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

    debug('backupDone():', filename);

    // CaaS
    if (config.token()) {
        var url = config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/backupDone';
        var data = {
            boxVersion: config.version(),
            appId: app ? app.id : null,
            appVersion: app ? app.manifest.version : null,
            appBackupIds: appBackupIds
        };

        superagent.post(url).send(data).query({ token: config.token() }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 200) return callback(new Error(result.text));
            if (!result.body) return callback(new Error('Unexpected response'));

            debug('backupDone()', filename);

            return callback(null);
        });
    } else {
        // TODO call custom webhook
        callback(null);
    }
}
