/* jslint node:true */

'use strict';

var debug = require('debug')('box:updater'),
    superagent = require('superagent'),
    config = require('../config.js'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

module.exports = exports = Updater;

function Updater() {
    EventEmitter.call(this);
    this.checkInterval = null;
}
util.inherits(Updater, EventEmitter);

Updater.prototype.check = function () {
    debug('check: for updates. box is on version ' + config.version);

    var that = this;

    superagent.get(config.appServerUrl + '/api/v1/boxupdate').query({version: config.version }).end(function (error, result) {
        if (error) return console.error(error);
        if (result.statusCode !== 200) return console.error('Failed to check for updates.', result.statusCode, result.body.message);

        debug('check: ', result.body);

        if (result.body.available) {
            debug('check: update to version ' + result.body.version + ' available.');
            that.emit('new_version', result.body);
        } else {
            debug('check: no update available.');
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