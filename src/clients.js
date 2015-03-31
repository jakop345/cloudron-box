'use strict';

var assert = require('assert'),
    hat = require('hat'),
    appdb = require('./appdb.js'),
    tokendb = require('./tokendb.js'),
    constants = require('../constants.js'),
    async = require('async'),
    debug = require('debug')('box:clients'),
    clientdb = require('./clientdb.js'),
    DatabaseError = require('./databaseerror.js'),
    uuid = require('node-uuid');

exports = module.exports = {
    add: add,
    get: get,
    update: update,
    del: del,
    getAllWithDetailsByUserId: getAllWithDetailsByUserId,
    getClientTokensByUserId: getClientTokensByUserId
};

function add(appIdentifier, redirectURI, scope, callback) {
    assert(typeof appIdentifier === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof scope === 'string');
    assert(typeof callback === 'function');

    var id = 'cid-' + uuid.v4();
    var clientSecret = hat();

    clientdb.add(id, appIdentifier, clientSecret, redirectURI, scope, function (error) {
        if (error) return callback(error);

        var client = {
            id: id,
            appId: appIdentifier,
            clientSecret: clientSecret,
            redirectURI: redirectURI,
            scope: scope
        };

        callback(null, client);
    });
}

function get(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    clientdb.get(id, function (error, result) {
        if (error) return callback(error);
        callback(null, result);
    });
}

// we only allow appIdentifier and redirectURI to be updated
function update(id, appIdentifier, redirectURI, callback) {
    assert(typeof id === 'string');
    assert(typeof appIdentifier === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof callback === 'function');

    clientdb.get(id, function (error, result) {
        if (error) return callback(error);

        clientdb.update(id, appIdentifier, result.clientSecret, redirectURI, result.scope, function (error, result) {
            if (error) return callback(error);
            callback(null, result);
        });
    });
}

function del(id, callback) {
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    clientdb.del(id, function (error, result) {
        if (error) return callback(error);
        callback(null, result);
    });
}

function getAllWithDetailsByUserId(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

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
    assert(typeof clientId === 'string');
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

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