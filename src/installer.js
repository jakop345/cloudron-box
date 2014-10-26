/* jslint node: true */

'use strict';

var assert = require('assert'),
    config = require('../config.js'),
    debug = require('debug')('box/installer'),
    os = require('os'),
    superagent = require('superagent');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,

    // exported for testing
    _getAnnounceTimerId: getAnnounceTimerId
};

var gAnnounceTimerId = null;

function initialize() {
    announce();
}

function uninitialize() {
    clearTimeout(gAnnounceTimerId);
    gAnnounceTimerId = null;
}

function getAnnounceTimerId() {
    return gAnnounceTimerId;
}

function announce() {
    if (config.token()) {
        debug('_announce: we already have a token %s. Skip announcing.', config.token());
        clearTimeout(gAnnounceTimerId);
        gAnnounceTimerId = null;
        return;
    }

    var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = config.appServerUrl() + '/api/v1/boxes/' + hostname + '/announce';
    debug('_announce: box with %s.', url);

    superagent.get(url).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('_announce: unable to announce to app server, try again.', error);
            gAnnounceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL); // try again
            return;
        }

        gAnnounceTimerId = setTimeout(announce, ANNOUNCE_INTERVAL * 2);

        debug('_announce: success');
    });
};

