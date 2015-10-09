'use strict';

exports = module.exports = {
    login: login,
    logout: logout
};

var assert = require('assert'),
    debug = require('debug')('box:simpleauth'),
    user = require('./user.js'),
    tokendb = require('./tokendb.js'),
    clientdb = require('./clientdb.js');

function login(clientId, username, password, callback) {
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('login: client %s and user %s', clientId, username);

    clientdb.get(clientId, function (error, clientObject) {
        if (error) return callback(error);

        user.verify(username, password, function (error, userObject) {
            if (error) return callback(error);

            var accessToken = tokendb.generateToken();
            var expires = Date.now() + 24 * 60 * 60 * 1000; // 1 day

            tokendb.add(accessToken, tokendb.PREFIX_USER + userObject.id, clientId, expires, clientObject.scope, function (error) {
                if (error) return callback(error);

                debug('login: new access token for client %s and user %s: %s', clientId, username, accessToken);

                callback(null, { accessToken: accessToken, user: userObject });
            });
        });
    });
}

function logout(accessToken, callback) {
    assert.strictEqual(typeof accessToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('logout: %s', accessToken);

    tokendb.del(accessToken, function (error) {
        if (error) return callback(error);
        callback(null);
    });
}
