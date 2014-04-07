'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    debug = require('debug')('authserver:authcodedb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    add: add,
    del: del
};

function init(configDir, callback) {
    assert(typeof configDir === 'string');
    assert(typeof callback === 'function');

    db = new DatabaseTable(path.join(configDir, 'db/authcode'), {
        authCode: { type: 'String', hashKey: true },
        redirectURI: { type: 'String' },
        userId: { type: 'String' },
        clientId: { type: 'String' }
    });

    callback(null);
}

function get(authCode, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    db.get(authCode, function (error, result) {
        callback(error, result);
    });
}

function add(authCode, clientId, redirectURI, userId, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof clientId === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    var data = {
        authCode: authCode,
        clientId: clientId,
        redirectURI: redirectURI,
        userId: userId
    };

    db.put(data, function (error) {
        callback(error);
    });
}

function del(authCode, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    db.remove(authCode, function (error) {
        callback(error);
    });
}

