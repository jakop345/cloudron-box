/* jslint node:true */

'use strict';

// intentionally placed here because of circular dep with cloudron.js
module.exports = exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    getUpdateInfo: getUpdateInfo,
    update: update
};

var appdb = require('./appdb.js'),
    assert = require('assert'),
    cloudron = require('./cloudron.js'),
    progress = require('./progress.js'),
    config = require('../config.js'),
    debug = require('debug')('box:updater'),
    fs = require('fs'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    superagent = require('superagent');

var INSTALLER_UPDATE_URL = 'http://127.0.0.1:2020/api/v1/installer/update';

var gCheckUpdatesIntervalId = null,
    gAppUpdateInfo = null,
    gBoxUpdateInfo = null;

function getUpdateInfo() {
    return {
        apps: gAppUpdateInfo,
        box: gBoxUpdateInfo
    };
}

function checkAppUpdates(callback) {
    appdb.getAppStoreIds(function (error, appVersions) {
        if (error) return callback(error);

        var appStoreIds = appVersions.map(function (appVersion) { return appVersion.appStoreId; });

        superagent.post(config.apiServerOrigin() + '/api/v1/appupdates').send({ appIds: appStoreIds, boxVersion: config.version() }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 200) return callback(new Error('Error checking app update: ', result.statusCode, result.body.message));

            debug('checkAppUpdates: %j', result.body);

            callback(null, result.body.appVersions);
        });
    });
}

function checkBoxUpdates(callback) {
    var currentVersion = config.version();

    superagent.get(config.get('boxVersionsUrl')).end(function (error, result) {
        if (error) return callback(error);
        if (result.status !== 200) return callback(new Error('Bad status:', result.status));

        var versions = safe.JSON.parse(result.text);

        if (!versions || typeof versions !== 'object') return callback(new Error('versions is not in valid format:' + safe.error));

        var latestVersion = Object.keys(versions).sort(semver.compare).pop();
        debug('checkBoxUpdates: Latest version is %s etag:%s', latestVersion, result.header['etag']);

        if (!latestVersion) return callback(new Error('No version available'));

        var nextVersion = null, nextVersionInfo = null;
        var currentVersionInfo = versions[currentVersion];
        if (!currentVersionInfo) {
            debug('Cloudron runs on unknown version %s. Offering to update to latest version', currentVersion);
            nextVersion = latestVersion;
            nextVersionInfo = versions[latestVersion];
        } else {
            nextVersion = currentVersionInfo.next;
            nextVersionInfo = nextVersion ? versions[nextVersion] : null;
        }

        if (nextVersionInfo && typeof nextVersionInfo === 'object') {
            debug('new version %s available. imageId: %d code: %s', nextVersion, nextVersionInfo.imageId, nextVersionInfo.sourceTarballUrl);
            callback(null, {
                version: nextVersion,
                changelog: nextVersionInfo.changelog,
                upgrade: nextVersionInfo.upgrade
            });
        } else {
            debug('no new version available.');
            callback(null, null);
        }
    });
}

function checkUpdates() {
    debug('Checking for app and box updates...');

    checkAppUpdates(function (error, appUpdateInfo) {
        if (error) debug('Error checking app updates: ', error);

        gAppUpdateInfo = appUpdateInfo;

        checkBoxUpdates(function (error, result) {
            if (error) debug('Error checking box updates: ', error);

            gBoxUpdateInfo = result;

            // Done we call this in an interval
        });
    });
}

function initialize(callback) {
    assert(typeof callback === 'function');

    progress.clear(progress.UPDATE);
    gCheckUpdatesIntervalId = setInterval(checkUpdates, 10 * 1000);
    callback(null);
}

function uninitialize(callback) {
    assert(typeof callback === 'function');

    clearInterval(gCheckUpdatesIntervalId);
    gCheckUpdatesIntervalId = null;

    callback(null);
}

function update(callback) {
    assert(typeof callback === 'function');

    progress.set(progress.UPDATE, 0, 'Begin update');

    startUpdate(function (error) {
        if (error) {
            progress.clear(progress.UPDATE);    // update failed, clear the update process
            return callback(error);
        }

        callback(null);
    });
}

function startUpdate(callback) {
    if (!gBoxUpdateInfo) {
        debug('no box update available');
        return callback(new Error('No update available'));
    }

    progress.set(progress.UPDATE, 5, 'Create backup');

    cloudron.backup(function (error) {
        if (error) return callback(error);

        if (gBoxUpdateInfo && gBoxUpdateInfo.upgrade) {
            debug('box needs upgrade');

            superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/upgrade')
              .query({ token: config.token() })
              .send({ version: gBoxUpdateInfo.version })
              .end(function (error, result) {
                if (error) return callback(new Error('Error making upgrade request: ' + error));
                if (result.status !== 202) return callback(new Error('Server not ready to upgrade: ' + result.body));

                progress.set(progress.UPDATE, 10, 'Updating base system');

                callback(null);
            });

            return;
        }

        // fetch a signed sourceTarballUrl
        superagent.get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/sourcetarballurl')
          .query({ token: config.token(), boxVersion: gBoxUpdateInfo.version })
          .end(function (error, result) {
            if (error) return callback(new Error('Error fetching sourceTarballUrl: ' + error));
            if (result.status !== 200) return callback(new Error('Error fetching sourceTarballUrl status: ' + result.status));
            if (!safe.query(result, 'body.url')) return callback(new Error('Error fetching sourceTarballUrl response: ' + result.body));

            // NOTE: the args here are tied to the installer revision, box code and appstore provisioning logic
            var args = {
                sourceTarballUrl: result.body.url,

                // this data is opaque to the installer
                data: {
                    boxVersionsUrl: config.get('boxVersionsUrl'),
                    version: gBoxUpdateInfo.version,
                    apiServerOrigin: config.apiServerOrigin(),
                    webServerOrigin: config.webServerOrigin(),
                    fqdn: config.fqdn(),
                    token: config.token(),
                    tlsCert: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.cert'), 'utf8'),
                    tlsKey: fs.readFileSync(path.join(paths.NGINX_CERT_DIR, 'host.key'), 'utf8'),
                    isCustomDomain: config.isCustomDomain(),
                    restoreUrl: null,
                    restoreKey: null,
                    developerMode: config.developerMode() // this survives updates but not upgrades
                }
            };

            debug('updating box %j', args);

            superagent.post(INSTALLER_UPDATE_URL).send(args).end(function (error, result) {
                if (error) return callback(error);
                if (result.status !== 202) return callback(new Error('Error initiating update: ' + result.body));

                progress.set(progress.UPDATE, 10, 'Updating cloudron software');

                callback(null);
            });
        });

        // Do not add any code here. The installer script will stop the box code any instant
    });
}

