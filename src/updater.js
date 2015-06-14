/* jslint node:true */

'use strict';

// intentionally placed here because of circular dep with cloudron.js
module.exports = exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    checkUpdates: checkUpdates,
    getUpdateInfo: getUpdateInfo,
    update: update,
    hasBoxUpdate: hasBoxUpdate
};

var appdb = require('./appdb.js'),
    apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    cloudron = require('./cloudron.js'),
    progress = require('./progress.js'),
    config = require('../config.js'),
    debug = require('debug')('box:updater'),
    fs = require('fs'),
    util = require('util'),
    mailer = require('./mailer.js'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    superagent = require('superagent');

var INSTALLER_UPDATE_URL = 'http://127.0.0.1:2020/api/v1/installer/update';

var gAppUpdateInfo = { }, // id -> update info
    gBoxUpdateInfo = null,
    gMailedUser =  { };

function getUpdateInfo() {
    return {
        apps: gAppUpdateInfo,
        box: gBoxUpdateInfo
    };
}

function hasBoxUpdate() {
    return gBoxUpdateInfo !== null;
}

function checkAppUpdates(callback) {
    appdb.getAll(function (error, apps) { // do not use apps.getAll because that uses updater information
        if (error) return callback(error);

        var appUpdateInfo = { };
        // appStoreId can be '' for dev apps
        var appStoreIds = apps.map(function (app) { return app.appStoreId; }).filter(function (id) { return id !== ''; });

        superagent
            .post(config.apiServerOrigin() + '/api/v1/appupdates')
            .send({ appIds: appStoreIds, boxVersion: config.version() })
            .timeout(10 * 1000)
            .end(function (error, result) {

            if (error) return callback(error);

            if (result.statusCode !== 200 || !result.body.appVersions) {
                return callback(new Error(util.format('Error checking app update: %s %s', result.statusCode, result.body.message)));
            }

            var latestAppVersions = result.body.appVersions;
            for (var i = 0; i < apps.length; i++) {
                if (!(apps[i].appStoreId in latestAppVersions)) continue;

                var oldVersion = apps[i].manifest.version;

                var newVersion = latestAppVersions[apps[i].appStoreId].manifest.version;
                if (newVersion !== oldVersion) {
                    debug('Update available for %s (%s) from %s to %s', apps[i].location, apps[i].id, oldVersion, newVersion);
                    appUpdateInfo[apps[i].id] = latestAppVersions[apps[i].appStoreId];
                }
            }

            callback(null, appUpdateInfo);
        });
    });
}

function checkBoxUpdates(callback) {
    var currentVersion = config.version();

    superagent
        .get(config.get('boxVersionsUrl'))
        .timeout(10 * 1000)
        .end(function (error, result) {
        if (error) return callback(error);
        if (result.status !== 200) return callback(new Error(util.format('Bad status: %s %s', result.status, result.text)));

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

function mailUser(callback) {
    if (gBoxUpdateInfo && !gMailedUser['box']) {
        mailer.boxUpdateAvailable(gBoxUpdateInfo.version, gBoxUpdateInfo.changelog);
        gMailedUser['box'] = true;
    }

    async.eachSeries(Object.keys(gAppUpdateInfo), function iterator(id, iteratorDone) {
        if (gMailedUser[id]) return iteratorDone();

        apps.get(id, function (error, app) {
            if (error) {
                debug('Error getting app %s %s', id, error);
                return iteratorDone();
            }

            mailer.appUpdateAvailable(app, gAppUpdateInfo[id]);
            gMailedUser[id] = true;
        });
    }, callback);
}

function checkUpdates() {
    debug('Checking for app and box updates...');

    checkAppUpdates(function (error, result) {
        if (error) debug('Error checking app updates: ', error);

        gAppUpdateInfo = error ? {} : result;

        checkBoxUpdates(function (error, result) {
            if (error) debug('Error checking box updates: ', error);

            gBoxUpdateInfo = error ? null : result;

            mailUser();

            // Done we call this in an interval
        });
    });
}

function initialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    progress.clear(progress.UPDATE);
    callback(null);
}

function uninitialize(callback) {
    assert.strictEqual(typeof callback, 'function');

    callback(null);
}

function update(callback) {
    assert.strictEqual(typeof callback, 'function');

    progress.set(progress.UPDATE, 0, 'Begin update');

    startUpdate(function (error) {
        if (error) {
            progress.clear(progress.UPDATE); // update failed, clear the update progress
            return callback(error);
        }

        callback(null);
    });
}

function upgrade(callback) {
    assert(gBoxUpdateInfo.upgrade);

    debug('box needs upgrade, backup box and apps');

    cloudron.backup(function (error) {
        if (error) return callback(error);

        superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/upgrade')
          .query({ token: config.token() })
          .send({ version: gBoxUpdateInfo.version })
          .end(function (error, result) {
            if (error) return callback(new Error('Error making upgrade request: ' + error));
            if (result.status !== 202) return callback(new Error('Server not ready to upgrade: ' + result.body));

            progress.set(progress.UPDATE, 10, 'Updating base system');

            callback(null);
        });
    });
}

function startUpdate(callback) {
    if (!gBoxUpdateInfo) {
        debug('no box update available');
        return callback(new Error('No update available'));
    }

    progress.set(progress.UPDATE, 5, 'Create backup');

    if (gBoxUpdateInfo && gBoxUpdateInfo.upgrade) {
        return upgrade(callback);
    }

    debug('box needs update, backup only box but not apps');

    cloudron.backupBox(function (error) {
        if (error) return callback(error);

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

