'use strict';

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('tokendb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    getByUserId: getByUserId,
    add: add,
    del: del,
    delByUserId: delByUserId
};

function init(configDir, callback) {
    assert(typeof configDir === 'string');
    assert(typeof callback === 'function');

    db = {};

    callback(null);
}

function get(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    if (!db[accessToken]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    callback(null, { accessToken: accessToken, userId: db[accessToken]});
}

function add(accessToken, userId, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    if (db[accessToken]) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
    db[accessToken] = userId;

    callback(null);
}

function del(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    if (!db[accessToken]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    delete db[accessToken];

    callback(null);
}

function getByUserId(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    for (var i in db) {
        if (db.hasOwnProperty(i)) {
            if (db[i] === userId) {
                return callback(null, i);
            }
        }
    }

    callback(new DatabaseError(DatabaseError.NOT_FOUND));
}

function delByUserId(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    var found = false;

    for (var i in db) {
        if (db.hasOwnProperty(i)) {
            if (db[i] === userId) {
                delete db[i];
            }
        }
    }

    if (!found) callback(new DatabaseError(DatabaseError.NOT_FOUND));
    callback(null);
}
