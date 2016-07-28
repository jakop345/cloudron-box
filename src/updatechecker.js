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

function getAppUpdate(app, callback) {
    superagent
       .get(config.apiServerOrigin() + '/api/v1/apps/' + app.appStoreId + '/versions/' + app.manifest.version + '/update')
        .query({ boxVersion: config.version() })
        .timeout(10 * 1000)
        .end(function (error, result) {

        if (error && !error.response) return callback(error);

        if (result.statusCode !== 200 || !('update' in result.body)) return callback(new Error(util.format('Bad response: %s %s', result.statusCode, result.text)));

        callback(null, result.body.update);
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
    var oldState = loadState();
    var newState = { box: oldState.box }; // create new state so that old app ids are removed

    apps.getAll(function (error, apps) {
        if (error) return callback(error);

        async.eachSeries(apps, function (app, iteratorDone) {
            if (app.appStoreId === '') return iteratorDone(); // appStoreId can be '' for dev apps

            getAppUpdate(app, function (error, updateInfo) {
                if (error) {
                    debug('Error getting app update info for %s', app.id, error);
                    return iteratorDone();  // continue to next
                }

                if (!updateInfo || !safe.query(updateInfo, 'manifest.version')) {
                    delete gAppUpdateInfo[app.id];
                    return iteratorDone();
                }

                gAppUpdateInfo[app.id] = updateInfo;

                // decide whether to send email
                newState[app.id] = updateInfo.manifest.version;

                if (oldState[app.id] === newState[app.id]) {
                    debug('Skipping notification of app update %s since user was already notified', app.id);
                    return iteratorDone();
                }

                if (semver.satisfies(newState[app.id], '~' + app.manifest.version)) {
                    debug('Skipping notification of box update as this is a patch release');
                } else {
                    mailer.appUpdateAvailable(app, updateInfo);
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
