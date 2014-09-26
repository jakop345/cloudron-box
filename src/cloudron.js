/* jslint node: true */

'use strict';

var backups = require('./backups.js'),
    debug = require('debug')('box:cloudron'),
    config = require('../config.js'),
    os = require('os'),
    superagent = require('superagent');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    // testing
    _getAnnounceTimerId: getAnnounceTimerId
};

var backupTimerId = null,
    announceTimerId = null;

function initialize() {
    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    backupTimerId = setInterval(backups.createBackup, 4 * 60 * 60 * 1000);

    announce();
}

function uninitialize() {
    clearInterval(backupTimerId);
    backupTimerId = null;

    clearTimeout(announceTimerId);
    announceTimerId = null;
}

function getAnnounceTimerId() {
    return announceTimerId;
}

function announce() {
    if (config.token) {
        debug('_announce: we already have a token %s. Skip announcing.', config.token);
        clearTimeout(announceTimerId);
        announceTimerId = null;
        return;
    }

    var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = config.appServerUrl + '/api/v1/boxes/' + hostname + '/announce';
    debug('_announce: box with %s.', url);

    superagent.get(url).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('_announce: unable to announce to app server, try again.', error);
            announceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL); // try again
            return;
        }

        announceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL * 2);

        debug('_announce: success');
    });
};

