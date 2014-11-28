'use strict';

var appFqdn = require('./apps').appFqdn,
    assert = require('assert'),
    clientdb = require('./clientdb.js'),
    debug = require('debug')('box:addons'),
    DatabaseError = require('./databaseerror.js'),
    uuid = require('node-uuid');

exports = module.exports = {
    allocateOAuthCredentials: allocateOAuthCredentials,
    removeOAuthCredentials: removeOAuthCredentials
};

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

    debug('allocateOAuthCredentials:', id, clientId, clientSecret, name);

    clientdb.getByAppId(appId, function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return callback(error);
        if (result) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));

        clientdb.add(id, appId, clientId, clientSecret, name, redirectURI, scope, callback);
    });
}

function removeOAuthCredentials(app, callback) {
    assert(typeof app === 'object');
    assert(typeof callback === 'function');

    debug('removeOAuthCredentials:', app.id);

    clientdb.delByAppId(app.id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null);
        if (error) console.error(error);

        callback(null);
    });
}
