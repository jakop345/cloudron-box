/* jslint node: true */

'use strict';

var assert = require('assert'),
    debug = require('debug')('installer:announce'),
    fs = require('fs'),
    os = require('os'),
    superagent = require('superagent');

exports = module.exports = {
    start: start,
    stop: stop
};

var gAnnounceTimerId = null;

var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

function start(apiServerOrigin, callback) {
    assert.strictEqual(typeof apiServerOrigin, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (fs.existsSync('/home/yellowtent/box')) {
        debug('already provisioned, skipping announce');
        return callback(null);
    }

    debug('started');

    gAnnounceTimerId = setInterval(doAnnounce.bind(null, apiServerOrigin), ANNOUNCE_INTERVAL);
    doAnnounce(apiServerOrigin);

    callback(null);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    debug('Stopping announce');

    clearInterval(gAnnounceTimerId);
    gAnnounceTimerId = null;

    callback(null);
}

function doAnnounce(apiServerOrigin) {
    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = apiServerOrigin + '/api/v1/boxes/' + hostname + '/announce';
    debug('box with %s.', url);

    superagent.get(url).timeout(10000).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('unable to announce to app server, try again.', error);
            return;
        }

        debug('success');
    });
}

