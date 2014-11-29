'use strict';

var appFqdn = require('./apps').appFqdn,
    appdb = require('./appdb.js'),
    assert = require('assert'),
    async = require('async'),
    clientdb = require('./clientdb.js'),
    config = require('../config.js'),
    debug = require('debug')('box:addons'),
    DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    uuid = require('node-uuid');

exports = module.exports = {
    setupAddons: setupAddons,
    teardownAddons: teardownAddons,
    getEnvironment: getEnvironment,

    // exported for testing
    _allocateOAuthCredentials: allocateOAuthCredentials,
    _removeOAuthCredentials: removeOAuthCredentials
};

var KNOWN_ADDONS = {
    oauth: {
        setup: allocateOAuthCredentials,
        teardown: removeOAuthCredentials
    },
    sendmail: {
        setup: setupSendMail,
        teardown: teardownSendMail
    }
};

function setupAddons(app, callback) {
    assert(typeof app === 'object');
    assert(!app.manifest.addons || util.isArray(app.manifest.addons));
    assert(typeof callback === 'function');

    if (!app.manifest.addons) return callback(null);

    async.eachSeries(app.manifest.addons, function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].setup(app, iteratorCallback);
    }, callback);
}

function teardownAddons(app, callback) {
    assert(typeof app === 'object');
    assert(!app.manifest.addons || util.isArray(app.manifest.addons));
    assert(typeof callback === 'function');

    if (!app.manifest.addons) return callback(null);

    async.eachSeries(app.manifest.addons, function iterator(addon, iteratorCallback) {
        if (!(addon in KNOWN_ADDONS)) return iteratorCallback(new Error('No such addon:' + addon));

        KNOWN_ADDONS[addon].teardown(app, iteratorCallback);
    }, callback);
}

function getEnvironment(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    appdb.getAddonConfigByAppId(appId, callback);
}

function allocateOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var id = uuid.v4();
    var appId = app.id;
    var clientId = 'cid-' + uuid.v4();
    var clientSecret = uuid.v4();
    var name = app.manifest.title;
    var redirectURI = 'https://' + appFqdn(app.location);
    var scope = 'profile,roleUser';

    debug('allocateOAuthCredentials: id:%s clientId:%s clientSecret:%s name:%s', id, clientId, clientSecret, name);

    clientdb.add(id, appId, clientId, clientSecret, name, redirectURI, scope, function (error) {
        if (error) return callback(error);

        var env = [
            'OAUTH_CLIENT_ID=' + clientId,
            'OAUTH_CLIENT_SECRET=' + clientSecret
        ];

        appdb.setAddonConfig(appId, 'oauth', env, callback);
    });
}

function removeOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('removeOAuthCredentials: %s', app.id);

    clientdb.delByAppId(app.id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null);
        if (error) console.error(error);

        appdb.unsetAddonConfig(app.id, 'oauth', callback);
    });
}

function setupSendMail(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    var env = [
        'MAIL_SERVER=' + config.get('mailServer'),
        'MAIL_USERNAME=' + app.location,
        'MAIL_DOMAIN=' + config.fqdn()
    ];

    debug('Setting up sendmail for %s', app.id);

    appdb.setAddonConfig(app.id, 'sendmail', env, callback);
}

function teardownSendMail(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('Tearing down sendmail for %s', app.id);

    appdb.unsetAddonConfig(app.id, 'sendmail', callback);
}

