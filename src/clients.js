'use strict';

var assert = require('assert'),
    hat = require('hat'),
    debug = require('debug')('box:clients'),
    clientdb = require('./clientdb.js'),
    DatabaseError = require('./databaseerror.js'),
    uuid = require('node-uuid');

exports = module.exports = {
    add: add,
    get: get,
    update: update,
    del: del
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