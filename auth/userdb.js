'use strict';

var DatabaseError = require('./databaseerror'),
    tokendb = require('./tokendb'),
    debug = require('debug')('authserver:userdb'),
    assert = require('assert');

// database
var db;

exports = module.exports = {
    init: init,
    getResponseObject: getResponseObject,
    get: get,
    getByUsername: getByUsername,
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

function getByUsername(username, callback) {
    assert(db !== null);
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    // currently username is also our id
    get(username, callback);
}

function add(userId, username, password, email, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof email === 'string');
    assert(typeof callback === 'function');

    if (db[userId]) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
    db[userId] = {
        id: userId,
        username: username,
        password: password,
        email: email
    };

    callback(null);
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
            callback(null, result);
        });
    });
}
