'use strict';

var DatabaseError = require('./databaseerror'),
    tokendb = require('./tokendb'),
    debug = require('debug')('userdb'),
    assert = require('assert');

// database
var db;

exports = module.exports = {
    init: init,
    getResponseObject: getResponseObject,
    get: get,
    getByAccessToken: getByAccessToken,
    add: add,
    del: del
};

function init(configDir, callback) {
    assert(typeof configDir === 'string');
    assert(typeof callback === 'function');

    db = {};

    callback(null);
}

// creates a new object to send over the network. This helps to prevent data leak
function getResponseObject(user) {
    assert(typeof user === 'object');

    var ret = user;
    return ret;
}

function get(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    if (!db[userId]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    callback(null, db[userId]);
}

function add(userId, user, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof user === 'object');
    assert(typeof callback === 'function');

    if (db[userId]) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
    db[userId] = user;
}

function del(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    if (!db[userId]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    delete db[userId];

    callback(null);
}

function getByAccessToken(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    tokendb.get(accessToken, function (error, result) {
        if (error) return callback(error);

        get(result.userId, function (error, result) {
            if (error) return callback(error);
            return callback(null, result);
        });
    });
}
