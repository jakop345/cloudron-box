/* jslint node:true */

'use strict';

var acme = require('./cert/acme.js'),
    assert = require('assert'),
    async = require('async'),
    config = require('./config.js'),
    debug = require('debug')('src/certificatemanager'),
    paths = require('./paths.js'),
    sysinfo = require('./sysinfo.js');

exports = module.exports = {
    initialize: initialize,
    uninitialize: uninitialize,
    autoRenew: autoRenew
};

function initialize(callback) {
    if (!config.isCustomDomain()) return callback();

    callback();
    // TODO: check if dns is in sync first!

    // acme.getCertificate(config.adminFqdn(), paths.APP_CERTS_DIR, function (error) {
        // copy to nginx cert dir
        // reload nginx
    // });
}

function uninitialize(callback) {
    callback();
}

function autoRenew() {
    debug('will automatically renew certs');
}
