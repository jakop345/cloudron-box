/* jslint node:true */

'use strict';

exports = module.exports = {
    checkAppUpdates: checkAppUpdates,
    checkBoxUpdates: checkBoxUpdates,

    getUpdateInfo: getUpdateInfo
};

var apps = require('./apps.js'),
    assert = require('assert'),
    async = require('async'),
    config = require('../config.js'),
    debug = require('debug')('box:updatechecker'),
    fs = require('fs'),
    mailer = require('./mailer.js'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    semver = require('semver'),
    superagent = require('superagent'),
    util = require('util');

var NOOP_CALLBACK = function (error) { console.error(error); };

var gAppUpdateInfo = { }, // id -> update info { creationDate, manifest }
    gBoxUpdateInfo = null,
    gMailedUser =  { };

function getUpdateInfo() {
    return {
        apps: gAppUpdateInfo,
        box: gBoxUpdateInfo
    };
}

function getAppUpdates(callback) {
    apps.getAll(function (error, apps) {
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
                return callback(new Error(util.format('Error checking app update: %s %s', result.statusCode, result.text)));
            }

            var latestAppVersions = result.body.appVersions;
            for (var i = 0; i < apps.length; i++) {
                if (!(apps[i].appStoreId in latestAppVersions)) continue;

                var oldVersion = apps[i].manifest.version;

                var newManifest = latestAppVersions[apps[i].appStoreId].manifest;
                var newVersion = newManifest.version;
                if (newVersion !== oldVersion) {
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

function checkAppUpdates() {
    debug('Checking App Updates');

    getAppUpdates(function (error, result) {
        if (error) debug('Error checking app updates: ', error);

        gAppUpdateInfo = error ? {} : result;

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
        });
    });
}

function checkBoxUpdates() {
    debug('Checking Box Updates');

    getBoxUpdates(function (error, result) {
        if (error) debug('Error checking box updates: ', error);

        gBoxUpdateInfo = error ? null : result;

        if (gBoxUpdateInfo && !gMailedUser['box']) {
            mailer.boxUpdateAvailable(gBoxUpdateInfo.version, gBoxUpdateInfo.changelog);
            gMailedUser['box'] = true;
        }
    });
}

