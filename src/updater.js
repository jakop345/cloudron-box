/* jslint node:true */

'use strict';

var appdb = require('./appdb.js'),
    assert = require('assert'),
    config = require('../config.js'),
    debug = require('debug')('box:updater'),
    execFile = require('child_process').execFile,
    path = require('path'),
    safe = require('safetydance'),
    superagent = require('superagent');

var BOX_VERSIONS_URL = 'https://s3.amazonaws.com/cloudron-releases/versions.json';

var gCheckUpdatesTimeoutId = null,
    gAppUpdateInfo = null,
    gBoxUpdateInfo = null;

module.exports = exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    getUpdateInfo: getUpdateInfo,
    update: update
};

function getUpdateInfo() {
    return {
        apps: gAppUpdateInfo,
        box: gBoxUpdateInfo
    };
};

function checkAppUpdates(callback) {
    debug('Checking app updates');
    appdb.getAppVersions(function (error, appVersions) {
        if (error) return callback(error);

        var appStoreIds = appVersions.map(function (appVersion) { return appVersion.appStoreId; });

        superagent.post(config.appServerUrl() + '/api/v1/boxupdate').send({ appIds: appStoreIds }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 200) return callback(new Error('Error checking app update: ' + result.statusCode + ' ' + result.body.message));

            debug('appupdate: %j', result.body);

            callback(null, result.body.appVersions);
        });
    });
}

function checkBoxUpdates(callback) {
    debug('checking for box update');

    superagent.get(BOX_VERSIONS_URL).end(function (error, result) {
        if (error) return callback(error);
        if (result.status !== 200) return callback(new Error('Bad status:', result.status));

        debug('versions.json : %j', result.text);

        var versions = safe.JSON.parse(result.text);

        if (!versions) return callback(new Error('versions.json is not valid json:' + safe.error));

        var currentVersionInfo = versions[config.version()];
        if (!currentVersionInfo) return callback(new Error('Cloudron runs on unknown version %s', config.version()));

        var nextVersion = currentVersionInfo.next;
        var nextVersionInfo = nextVersion ? versions[nextVersion] : null;

        if (nextVersionInfo && nextVersionInfo.revision && nextVersionInfo.imageId) {
            debug('boxupdate: new version %s available. revision: %s, imageId: %s', nextVersion, nextVersionInfo.revision, nextVersionInfo.imageId);
            callback(null, { version: nextVersion, info: nextVersionInfo, upgrade: nextVersionInfo.imageId !== currentVersionInfo.imageId });
        } else {
            debug('boxupdate: no new version available.');
            callback(null, null);
        }
    });
};

function checkUpdates() {
    checkAppUpdates(function (error, appUpdateInfo) {
        if (error) debug('Error checkihg app updates: ', error);

        if (appUpdateInfo) gAppUpdateInfo = appUpdateInfo;

        checkBoxUpdates(function (error, result) {
            if (error) debug('Error checkihg box updates: ', error);

            if (result) gBoxUpdateInfo = result;

            gCheckUpdatesTimeoutId = setTimeout(checkUpdates, 60 * 1000);
        });
    });
}

function initialize() {
    debug('initialize');

    gCheckUpdatesTimeoutId = setTimeout(checkUpdates, 60 * 1000);
};

function uninitialize() {
    debug('uninitialize');

    clearTimeout(gCheckUpdatesTimeoutId);
    gCheckUpdatesTimeoutId = null;
};

function update(backupUrl, callback) {
    assert(typeof backupUrl === 'string');
    assert(typeof callback === 'function');

    var isDev = config.get('isDev');

    if (!isDev && !gBoxUpdateInfo) {
        debug('update: no box update available');
        return callback(new Error('No update available'));
    }

    if (gBoxUpdateInfo && gBoxUpdateInfo.imageId) {
        debug('update: box needs upgrade');
        // TODO: cloudron.backup() here. currently, we cannot since backup requires a restart

        superagent.post(config.appServerUrl() + '/api/v1/boxes/' + config.fqdn() + '/upgrade').query({ token: config.token() }).end(function (error, result) {
            if (error) return callback(new Error('Error making upgrade request: ' + error));
            if (result.status !== 200) return callback(new Error('Server not ready to upgrade: ' + result.body));

            callback(null);
        });

        // TODO: UI needs some indication that we are awaiting upgrade and nobody should do anything...
        return;
    }

    var args = [
        path.join(__dirname, 'scripts/update.sh'),
        gBoxUpdateInfo ? gBoxUpdateInfo.version : config.version(),
        gBoxUpdateInfo ? gBoxUpdateInfo.revision : 'origin/master',
        backupUrl
    ];

    var options = {
        cwd: path.join(__dirname, '..')
    };

    debug('update: sudo %s', args.join(' '));

    execFile('/usr/bin/sudo', args, options, function (error, stdout, stderr) {
        if (error) {
            console.error('Error running update script.', stdout, stderr);
            return callback(error);
        }

        debug('update: success.', stdout, stderr);

        // Do not add any code here. The update script will stop the box code any instant

        callback(null);
    });
};

