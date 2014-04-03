'use strict';

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('authcodedb'),
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

    db = {};

    callback(null);
}

function get(authCode, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    if (!db[authCode]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    callback(null, { authCode: authCode, userId: db[authCode]});
}

function add(authCode, clientId, redirectURI, userId, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof clientId === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    if (db[authCode]) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));

    db[authCode] = {
        clientId: clientId,
        redirectURI: redirectURI,
        userId: userId
    };

    callback(null);
}

function del(authCode, callback) {
    assert(db !== null);
    assert(typeof authCode === 'string');
    assert(typeof callback === 'function');

    if (!db[authCode]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    delete db[authCode];

    callback(null);
}

