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

    sendHeartBeat();
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

function sendHeartBeat() {
    var HEARTBEAT_INTERVAL = 1000 * 60;

    if (!config.appServerUrl) {
        debug('No appstore server url set. Not sending heartbeat.');
        return;
    }

    if (!config.token) {
        debug('No appstore server token set. Not sending heartbeat.');
        return;
    }

    var url = config.appServerUrl + '/api/v1/boxes/' + os.hostname() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    superagent.get(url).query({ token: config.token }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successfull');

        setTimeout(sendHeartBeat, HEARTBEAT_INTERVAL);
    });
};

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

