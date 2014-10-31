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

var gCheckUpdateIntervalId = null,
    gAppsUpdateInfo = null,
    gBoxUpdateInfo = null;

module.exports = exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    getUpdateInfo: getUpdateInfo,
    update: update
};

function getUpdateInfo() {
    return {
        apps: gAppsUpdateInfo,
        box: gBoxUpdateInfo
    };
};

function checkUpdate() {
    debug('check: for updates. box is on version ' + config.version());

    // app updates
    appdb.getAppVersions(function (error, appVersions) {
        if (error) return console.error(error);

        var appStoreIds = appVersions.map(function (appVersion) { return appVersion.appStoreId; });

        superagent.post(config.appServerUrl() + '/api/v1/boxupdate').send({ appIds: appStoreIds }).end(function (error, result) {
            if (error) return console.error(error);
            if (result.statusCode !== 200) return console.error('Failed to check for updates.', result.statusCode, result.body.message);

            debug('check: ', result.body);

            gAppsUpdateInfo = result.body.appVersions;
        });
    });

    // box updates
    superagent.get(BOX_VERSIONS_URL).end(function (error, result) {
        if (error || result.status !== 200) {
            console.error('Unable to fetch versions.json.', error, result);
            return;
        }

        debug('_check: versions.json successfully fetched.', result.text);

        var versions = safe.JSON.parse(result.text);

        if (!versions) {
            console.error('versions.json is not valid json', safe.error);
            return;
        }

        if (!versions[config.version()]) {
            console.error('Cloudron runs on unknown version %s', config.version());
            gBoxUpdateInfo = null;
            return;
        }

        var next = versions[config.version()].next;
        if (next && versions[next] && versions[next].revision) {
            debug('_check: new version %s available to revision %s.', next, versions[next].revision);
            gBoxUpdateInfo = versions[next];
            gBoxUpdateInfo.version = next;
        } else {
            debug('_check: no new version available.');
            gBoxUpdateInfo = null;
        }
    });
};

function initialize() {
    debug('initialize');

    gCheckUpdateIntervalId = setInterval(checkUpdate, 60 * 1000);
};

function uninitialize() {
    debug('uninitialize');

    clearInterval(gCheckUpdateIntervalId);
    gCheckUpdateIntervalId = null;
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

