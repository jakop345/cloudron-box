'use strict';

var appFqdn = require('./apps').appFqdn,
    assert = require('assert'),
    clientdb = require('./clientdb.js'),
    debug = require('debug')('box:addons'),
    DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    uuid = require('node-uuid');

exports = module.exports = {
    setupAddons: setupAddons,
    teardownAddons: teardownAddons,

    // exported for testing
    _allocateOAuthCredentials: allocateOAuthCredentials,
    _removeOAuthCredentials: removeOAuthCredentials
};

function setupAddons(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    allocateOAuthCredentials(app, callback);
}

function teardownAddons(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    removeOAuthCredentials(app, callback);
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

    debug('allocateOAuthCredentials: id', id, clientId, clientSecret, name);

    clientdb.add(id, appId, clientId, clientSecret, name, redirectURI, scope, function (error) {
        if (error) return callback(error);

        callback(null);
    });
}

function removeOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('removeOAuthCredentials: %s', app.id);

    clientdb.delByAppId(app.id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null);
        if (error) console.error(error);

        callback(null);
    });
}
