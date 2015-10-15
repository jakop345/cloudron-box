'use strict';

exports = module.exports = {
    ClientsError: ClientsError,

    add: add,
    get: get,
    del: del,
    getAllWithDetailsByUserId: getAllWithDetailsByUserId,
    getClientTokensByUserId: getClientTokensByUserId,
    delClientTokensByUserId: delClientTokensByUserId
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

function validateScope(scope) {
    assert.strictEqual(typeof scope, 'string');

    if (scope === '') return new ClientsError(ClientsError.INVALID_SCOPE);
    if (scope === '*') return null;

    // TODO maybe validate all individual scopes if they exist

    return null;
}

function add(appId, redirectURI, scope, callback) {
    assert.strictEqual(typeof appId, 'string');
    assert.strictEqual(typeof redirectURI, 'string');
    assert.strictEqual(typeof scope, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateScope(scope);
    if (error) return callback(error);

    var id = 'cid-' + uuid.v4();
    var clientSecret = hat(256);

    clientdb.add(id, appId, clientSecret, redirectURI, scope, function (error) {
        if (error) return callback(error);

        var client = {
            id: id,
            appId: appId,
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

function getAllWithDetailsByUserId(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    clientdb.getAllWithTokenCountByIdentifier(tokendb.PREFIX_USER + userId, function (error, results) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, []);
        if (error) return callback(error);

        // We have several types of records here
        //   1) webadmin has an app id of 'webadmin'
        //   2) oauth proxy records are always the app id prefixed with 'proxy-'
        //   3) addon oauth records for apps prefixed with 'addon-'
        //   4) external app records prefixed with 'external-'
        //   5) normal apps on the cloudron without a prefix

        var tmp = [];
        async.each(results, function (record, callback) {
            if (record.appId === constants.ADMIN_CLIENT_ID) {
                record.name = constants.ADMIN_NAME;
                record.location = constants.ADMIN_LOCATION;
                record.type = 'webadmin';

                tmp.push(record);

                return callback(null);
            } else if (record.appId === constants.TEST_CLIENT_ID) {
                record.name = constants.TEST_NAME;
                record.location = constants.TEST_LOCATION;
                record.type = 'test';

                tmp.push(record);

                return callback(null);
            }

            var appId = record.appId;
            var type = 'app';

            // Handle our different types of oauth clients
            if (record.appId.indexOf('addon-') === 0) {
                appId = record.appId.slice('addon-'.length);
                type = 'addon';
            } else if (record.appId.indexOf('proxy-') === 0) {
                appId = record.appId.slice('proxy-'.length);
                type = 'proxy';
            }

            appdb.get(appId, function (error, result) {
                if (error) {
                    console.error('Failed to get app details for oauth client', result, error);
                    return callback(null);  // ignore error so we continue listing clients
                }

                record.name = result.manifest.title + (record.appId.indexOf('proxy-') === 0 ? 'OAuth Proxy' : '');
                record.location = result.location;
                record.type = type;

                tmp.push(record);

                callback(null);
            });
        }, function (error) {
            if (error) return callback(error);
            callback(null, tmp);
        });
    });
}

function getClientTokensByUserId(clientId, userId, callback) {
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    tokendb.getByIdentifierAndClientId(tokendb.PREFIX_USER + userId, clientId, function (error, result) {
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

    tokendb.delByIdentifierAndClientId(tokendb.PREFIX_USER + userId, clientId, function (error) {
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
