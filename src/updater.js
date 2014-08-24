/* jslint node:true */

'use strict';

var debug = require('debug')('box:updater'),
    superagent = require('superagent'),
    path = require('path'),
    assert = require('assert'),
    exec = require('child_process').exec,
    config = require('../config.js');

module.exports = exports = Updater;

function Updater() {
    this.checkInterval = null;
    this.updateInfo = null;
}

Updater.prototype.availableUpdate = function () {
    return this.updateInfo;
};

Updater.prototype.check = function () {
    debug('check: for updates. box is on version ' + config.version);

    var that = this;

    superagent.get(config.appServerUrl + '/api/v1/boxupdate').query({version: config.version }).end(function (error, result) {
        if (error) return console.error(error);
        if (result.statusCode !== 200) return console.error('Failed to check for updates.', result.statusCode, result.body.message);

        debug('check: ', result.body);

        if (result.body.available) {
            debug('check: update to version ' + result.body.version + ' available.');
            that.updateInfo = {
                version: result.body.version,
                revision: result.body.revision
            };
        } else {
            debug('check: no update available.');
            that.updateInfo = null;
        }
    });
};

Updater.prototype.start = function () {
    debug('start');

    this.checkInterval = setInterval(this.check.bind(this), 60 * 1000);
};

Updater.prototype.stop = function () {
    debug('stop');

    clearInterval(this.checkInterval);
};

Updater.prototype.update = function (callback) {
    assert(typeof callback === 'function');

    var command = 'sudo ' + path.join(__dirname, '../scripts/update.sh');
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

        callback(null);
    });
};