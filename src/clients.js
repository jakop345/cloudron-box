'use strict';

exports = module.exports = {
    ClientsError: ClientsError,

    add: add,
    get: get,
    del: del,
    getAll: getAll,
    getByAppIdAndType: getByAppIdAndType,
    getClientTokensByUserId: getClientTokensByUserId,
    delClientTokensByUserId: delClientTokensByUserId,
    delByAppIdAndType: delByAppIdAndType,
    addClientTokenByUserId: addClientTokenByUserId,

    // keep this in sync with start.sh ADMIN_SCOPES that generates the cid-webadmin
    SCOPE_APPS: 'apps',
    SCOPE_DEVELOPER: 'developer',
    SCOPE_PROFILE: 'profile',
    SCOPE_CLOUDRON: 'cloudron',
    SCOPE_SETTINGS: 'settings',
    SCOPE_USERS: 'users',

    // roles are handled just like the above scopes, they are parallel to scopes
    // scopes enclose API groups, roles specify the usage role
    SCOPE_ROLE_SDK: 'roleSdk',

    // client type enums
    TYPE_EXTERNAL: 'external',
    TYPE_OAUTH: 'addon-oauth',
    TYPE_SIMPLE_AUTH: 'addon-simpleauth',
    TYPE_PROXY: 'addon-proxy',
    TYPE_ADMIN: 'admin'
};

var assert = require('assert'),
    util = require('util'),
    hat = require('hat'),
    appdb = require('./appdb.js'),
    tokendb = require('./tokendb.js'),
    constants = require('./constants.js'),
    async = require('async'),
    clientdb = require('./clientdb.js'),
    DatabaseError = require('./databaseerror.js'),
    uuid = require('node-uuid');

function ClientsError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(ClientsError, Error);
ClientsError.INVALID_SCOPE = 'Invalid scope';
ClientsError.INVALID_CLIENT = 'Invalid client';
ClientsError.INTERNAL_ERROR = 'Internal Error';

function validateScope(scope) {
    assert.strictEqual(typeof scope, 'string');

    var VALID_SCOPES = [
        exports.SCOPE_APPS,
        exports.SCOPE_DEVELOPER,
        exports.SCOPE_PROFILE,
        exports.SCOPE_CLOUDRON,
        exports.SCOPE_SETTINGS,
        exports.SCOPE_USERS,
        '*',    // includes all scopes, but not roles
        exports.SCOPE_ROLE_SDK
    ];

    if (scope === '') return new ClientsError(ClientsError.INVALID_SCOPE, 'Empty scope not allowed');

    var allValid = scope.split(',').every(function (s) { return VALID_SCOPES.indexOf(s) !== -1; });
    if (!allValid) return new ClientsError(ClientsError.INVALID_SCOPE, 'Invalid scope. Available scopes are ' + VALID_SCOPES.join(', '));

    return null;
}

function add(appId, type, redirectURI, scope, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof redirectURI, 'string');
    assert.strictEqual(typeof scope, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateScope(scope);
    if (error) return callback(error);

    var id = 'cid-' + uuid.v4();
    var clientSecret = hat(256);

    clientdb.add(id, appId, type, clientSecret, redirectURI, scope, function (error) {
        if (error) return callback(error);

        var client = {
            id: id,
            appId: appId,
            type: type,
            clientSecret: clientSecret,
            redirectURI: redirectURI,
            scope: scope
        };

        callback(null, client);
    });
}

function get(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    clientdb.get(id, function (error, result) {
        if (error) return callback(error);
        callback(null, result);
    });
}

function del(id, callback) {
    assert.strictEqual(typeof id, 'string');
    assert.strictEqual(typeof callback, 'function');

    clientdb.del(id, function (error, result) {
        if (error) return callback(error);
        callback(null, result);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    clientdb.getAll(function (error, results) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, []);
        if (error) return callback(error);

        var tmp = [];
        async.each(results, function (record, callback) {
            if (record.type === exports.TYPE_ADMIN) {
                record.name = constants.ADMIN_NAME;
                record.location = constants.ADMIN_LOCATION;

                tmp.push(record);

                return callback(null);
            } else if (record.type === exports.TYPE_EXTERNAL) {
                record.name = record.appId;
                record.location = 'external';

                tmp.push(record);

                return callback(null);
            }

            appdb.get(record.appId, function (error, result) {
                if (error) {
                    console.error('Failed to get app details for oauth client', result, error);
                    return callback(null);  // ignore error so we continue listing clients
                }

                if (record.type === exports.TYPE_PROXY) record.name = result.manifest.title + ' Website Proxy';
                if (record.type === exports.TYPE_OAUTH) record.name = result.manifest.title + ' OAuth';
                if (record.type === exports.TYPE_SIMPLE_AUTH) record.name = result.manifest.title + ' Simple Auth';

                record.location = result.location;

                tmp.push(record);

                callback(null);
            });
        }, function (error) {
            if (error) return callback(error);
            callback(null, tmp);
        });
    });
}

function getByAppIdAndType(appId, type, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    clientdb.getByAppIdAndType(appId, type, function (error, result) {
        if (error) return callback(error);
        callback(null, result);
    });
}

function getClientTokensByUserId(clientId, userId, callback) {
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    tokendb.getByIdentifierAndClientId(userId, clientId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) {
            // this can mean either that there are no tokens or the clientId is actually unknown
            clientdb.get(clientId, function (error/*, result*/) {
                if (error) return callback(error);
                callback(null, []);
            });
            return;
        }
        if (error) return callback(error);
        callback(null, result || []);
    });
}

function delClientTokensByUserId(clientId, userId, callback) {
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    tokendb.delByIdentifierAndClientId(userId, clientId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) {
            // this can mean either that there are no tokens or the clientId is actually unknown
            clientdb.get(clientId, function (error/*, result*/) {
                if (error) return callback(error);
                callback(null);
            });
            return;
        }
        if (error) return callback(error);
        callback(null);
    });
}

function delByAppIdAndType(appId, type, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof type, 'string');
    assert.strictEqual(typeof callback, 'function');

    clientdb.delByAppIdAndType(appId, type, function (error) {
        if (error) return callback(error);
        callback(null);
    });
}

function addClientTokenByUserId(clientId, userId, callback) {
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    get(clientId, function (error, result) {
        if (error) return callback(error);

        var token = tokendb.generateToken();
        var expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 1 day

        tokendb.add(token, userId, result.id, expiresAt, result.scope, function (error) {
            if (error) return callback(new ClientsError(ClientsError.INTERNAL_ERROR, error));

            callback(null, { token: {
                accessToken: token,
                identifier: userId,
                clientId: result.id,
                scope: result.id,
                expires: expiresAt
            }});
        });
    });
}
