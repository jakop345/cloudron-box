/* jslint node:true */

'use strict';

var debug = require('debug')('box:updater'),
    superagent = require('superagent'),
    path = require('path'),
    assert = require('assert'),
    exec = require('child_process').exec,
    appdb = require('./appdb.js'),
    config = require('../config.js');

module.exports = exports = Updater;

function Updater() {
    this._checkInterval = null;
    this._boxUpdateManifestUrl = null;
    // this._boxUpdateInfoManifestUrl = 'http://localhost:8000/VERSIONS.json';
    this._boxUpdateInfo = null;
    this._appUpdateInfo = null;
}

Updater.prototype.availableUpdate = function () {
    return {
        apps: this._appUpdateInfo,
        box: this._boxUpdateInfo
    };

};

Updater.prototype._check = function () {
    debug('check: for updates. box is on version ' + config.version);

    var that = this;

    // app updates
    appdb.getAppVersions(function (error, appVersions) {
        if (error) return console.error(error);

        var appIds = appVersions.map(function (appVersion) { return appVersion.id; });

        superagent.post(config.appServerUrl + '/api/v1/boxupdate').send({ appIds: appIds, version: config.version }).end(function (error, result) {
            if (error) return console.error(error);
            if (result.statusCode !== 200) return console.error('Failed to check for updates.', result.statusCode, result.body.message);

            debug('check: ', result.body);

            that._appUpdateInfo = result.body;
        });
    });

    // box updates
    if (!this._boxUpdateInfoManifestUrl) return;

    superagent.get(this._boxUpdateInfoManifestUrl).end(function (error, result) {
        if (error) {
            console.error('Unable to fetch VERSIONS.json.', error);
            return;
        }

        debug('_check: VERSIONS.json successfully fetched.', result.body);

        var versions = result.body;

        if (!versions[config.version]) {
            console.error('Cloudron runs on unknown version %s', config.version);
            that._boxUpdateInfo = null;
            return;
        }

        var next = versions[config.version].next;
        if (next && versions[next] && versions[next].revision) {
            debug('_check: new version %s available to revision %s.', next, versions[next].revision);
            that._boxUpdateInfo = versions[next];
            that._boxUpdateInfo.version = next;
        } else {
            debug('_check: no new version available.');
            that._boxUpdateInfo = null;
        }
    });
};

Updater.prototype.start = function () {
    debug('start');

    this._checkInterval = setInterval(this._check.bind(this), 60 * 1000);
};

Updater.prototype.stop = function () {
    debug('stop');

    clearInterval(this._checkInterval);
};

Updater.prototype.update = function (callback) {
    assert(typeof callback === 'function');

    var that = this;
    var isDev = config.appServerUrl === 'https://appstore-dev.herokuapp.com' || config.appServerUrl === 'https://selfhost.io:5050';

    if (!isDev && !this._boxUpdateInfo) {
        debug('update: no box update available');
        return callback(new Error('No update available'));
    }

    var command = 'sudo ' + path.join(__dirname, 'scripts/update.sh') + ' ' + (isDev ? 'origin/master' : this._boxUpdateInfo.revision);
    var options = {
        cwd: path.join(__dirname, '..')
    };

    debug('update: use command "%s".', command);

    exec(command, options, function (error, stdout, stderr) {
        if (error) {
            console.error('Error running update script.', stdout, stderr);
            return callback(error);
        }

        debug('update: success.', stdout, stderr);

        // save version change
        config.version = that._boxUpdateInfo.version;
        config.save();

        callback(null);
    });
};
