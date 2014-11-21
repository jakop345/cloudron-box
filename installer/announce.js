/* jslint node: true */

'use strict';

var assert = require('assert'),
    debug = require('debug')('installer:announce'),
    os = require('os'),
    superagent = require('superagent');

exports = module.exports = {
    start: start,
    stop: stop
};

var gAnnounceTimerId = null;

var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

function start(appServerUrl, callback) {
    assert(typeof appServerUrl === 'string');
    assert(typeof callback === 'function');

    gAnnounceTimerId = setInterval(doAnnounce.bind(null, appServerUrl), ANNOUNCE_INTERVAL);
    callback(null);
}

function stop(callback) {
    assert(!callback || typeof callback === 'function');
    callback = callback || function () { };

    debug('Stopping announce');

    clearInterval(gAnnounceTimerId);
    gAnnounceTimerId = null;

    callback(null);
}

function doAnnounce(appServerUrl) {
    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = appServerUrl + '/api/v1/boxes/' + hostname + '/announce';
    debug('announce: box with %s.', url);

    superagent.get(url).timeout(10000).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('announce: unable to announce to app server, try again.', error);
            return;
        }

        debug('announce: success');
    });
};

