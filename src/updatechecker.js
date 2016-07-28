'use strict';

exports = module.exports = {
    checkAppUpdates: checkAppUpdates,
    checkBoxUpdates: checkBoxUpdates,

    getUpdateInfo: getUpdateInfo,
    resetUpdateInfo: resetUpdateInfo
};

var apps = require('./apps.js'),
    async = require('async'),
    config = require('./config.js'),
    debug = require('debug')('box:updatechecker'),
    mailer = require('./mailer.js'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    settings = require('./settings.js'),
    superagent = require('superagent'),
    util = require('util');

var gAppUpdateInfo = { }, // id -> update info { creationDate, manifest }
    gBoxUpdateInfo = null; // { version, changelog, upgrade, sourceTarballUrl }

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

function loadState() {
    var state = safe.JSON.parse(safe.fs.readFileSync(paths.UPDATE_CHECKER_FILE, 'utf8'));
    return state || { };
}

function saveState(mailedUser) {
    safe.fs.writeFileSync(paths.UPDATE_CHECKER_FILE, JSON.stringify(mailedUser, null, 4), 'utf8');
}

function getUpdateInfo() {
    return {
        apps: gAppUpdateInfo,
        box: gBoxUpdateInfo
    };
}

function resetUpdateInfo() {
    gAppUpdateInfo = { };
    gBoxUpdateInfo = null;
}

function getAppUpdates(callback) {
    apps.getAll(function (error, apps) {
        if (error) return callback(error);

        var appUpdateInfo = { };
        // appStoreId can be '' for dev apps
        var appStoreIds = apps.map(function (app) { return app.appStoreId; }).filter(function (id) { return id !== ''; });
        var appVersions = apps.map(function (app) { return { id: app.appStoreId, version: app.manifest.version }; } ).filter(function (v) { return v.id !== ''; });

        superagent
            .post(config.apiServerOrigin() + '/api/v1/appupdates')
            .send({ appIds: appStoreIds, appVersions: appVersions, boxVersion: config.version() })
            .timeout(10 * 1000)
            .end(function (error, result) {

            if (error && !error.response) return callback(error);

            if (result.statusCode !== 200 || !result.body.appVersions) {
                return callback(new Error(util.format('Error checking app update: %s %s', result.statusCode, result.text)));
            }

            var latestAppVersions = result.body.appVersions;
            for (var i = 0; i < apps.length; i++) {
                if (!(apps[i].appStoreId in latestAppVersions)) continue;

                var oldVersion = apps[i].manifest.version;

                var newManifest = latestAppVersions[apps[i].appStoreId].manifest;
                var newVersion = newManifest.version;
                if (semver.gt(newVersion, oldVersion)) {
                    appUpdateInfo[apps[i].id] = latestAppVersions[apps[i].appStoreId];
                    debug('Update available for %s (%s) from %s to %s', apps[i].location, apps[i].id, oldVersion, newVersion);
                }
            }

            callback(null, appUpdateInfo);
        });
    });
}

function getBoxUpdates(callback) {
    var currentVersion = config.version();

    // do not crash if boxVersionsUrl is not set
    if (!config.get('boxVersionsUrl')) return callback(null, null);

    superagent
        .get(config.get('boxVersionsUrl'))
        .timeout(10 * 1000)
        .end(function (error, result) {
        if (error && !error.response) return callback(error);
        if (result.statusCode !== 200) return callback(new Error(util.format('Bad status: %s %s', result.statusCode, result.text)));

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
                upgrade: nextVersionInfo.upgrade,
                sourceTarballUrl: nextVersionInfo.sourceTarballUrl
            });
        } else {
            debug('no new version available.');
            callback(null, null);
        }
    });
}

function checkAppUpdates(callback) {
    callback = callback || NOOP_CALLBACK; // null when called from a timer task

    debug('Checking App Updates');

    gAppUpdateInfo = { };

    getAppUpdates(function (error, updateInfo) {
        if (error) return callback(error);

        var oldState = loadState();
        var newState = { box: oldState.box }; // create new state so that old app ids are removed

        async.eachSeries(Object.keys(updateInfo), function iterator(id, iteratorDone) {
            gAppUpdateInfo[id] = updateInfo[id];

            // decide whether to send email
            newState[id] = updateInfo[id].manifest.version;

            if (oldState[id] === updateInfo[id].manifest.version) {
                debug('Skipping notification of app update %s since user was already notified', id);
                return iteratorDone();
            }

            apps.get(id, function (error, app) {
                if (error) {
                    debug('Error getting app %s %s', id, error);
                    return iteratorDone();
                }

                if (semver.satisfies(newState[id], '~' + app.manifest.version)) {
                    debug('Skipping notification of box update as this is a patch release');
                } else {
                    mailer.appUpdateAvailable(app, updateInfo[id]);
                }

                iteratorDone();
            });
        }, function () {
            saveState(newState);
            callback();
        });
    });
}

function checkBoxUpdates(callback) {
    callback = callback || NOOP_CALLBACK; // null when called from a timer task

    debug('Checking Box Updates');

    gBoxUpdateInfo = null;

    getBoxUpdates(function (error, updateInfo) {
        if (error || !updateInfo) return callback(error);

        settings.getUpdateConfig(function (error, updateConfig) {
            if (error) return callback(error);

            var isPrerelease = semver.parse(updateInfo.version).prerelease.length !== 0;

            if (isPrerelease && !updateConfig.prerelease) {
                debug('Skipping update %s since this box does not want prereleases', updateInfo.version);
                return callback();
            }

            gBoxUpdateInfo = updateInfo;

            // decide whether to send email
            var state = loadState();

            if (state.box === gBoxUpdateInfo.version) {
                debug('Skipping notification of box update as user was already notified');
                return callback();
            }

            if (semver.satisfies(gBoxUpdateInfo.version, '~' + config.version())) {
                debug('Skipping notification of box update as this is a patch release');
            } else {
                mailer.boxUpdateAvailable(updateInfo.version, updateInfo.changelog);
            }

            state.box = updateInfo.version;

            saveState(state);

            callback();
        });
    });
}
