'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    tokendb = require('./tokendb'),
    debug = require('debug')('userdb'),
    assert = require('assert');

// database
var db;

exports = module.exports = {
    init: init,
    get: get,
    getByUsername: getByUsername,
    getByAccessToken: getByAccessToken,
    getAll: getAll,
    add: add,
    del: del,
    clear: clear,
    update: update,
    count: count,
    removePrivates: removePrivates
};

function init(configDir) {
    assert(typeof configDir === 'string');

    db = new DatabaseTable(path.join(configDir, 'db/users'), {
        id: { type: 'String', hashKey: true },
        username: { type: 'String' },
        email: { type: 'String' },
        password: { type: 'String', priv: true },
        publicPem: { type: 'String' },
        privatePemCipher: { type: 'String', priv: true },
        salt: { type: 'String', priv: true },
        createdAt: { type: 'String' },
        modifiedAt: { type: 'String' },
        admin: { type: 'Boolean' }
    });
}

function removePrivates(obj) {
    assert(db !== null);
    assert(typeof obj === 'object');

    debug('removePrivates: ' + JSON.stringify(obj));

    return db.removePrivates(obj);
}

function get(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    debug('get: ' + userId);

    db.get(userId, function (error, result) {
        callback(error, result);
    });
}

function getByUsername(username, callback) {
    assert(db !== null);
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    debug('getByUsername: ' + username);

    // currently username is also our id
    get(username, callback);
}

function getAll(privates, callback) {
    assert(db !== null);
    assert(typeof privates === 'boolean');
    assert(typeof callback === 'function');

    debug('getAll: include privates ' + privates);

    db.getAll(privates, function (error, result) {
        callback(error, result);
    });
}

function add(userId, user, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof user.username === 'string');
    assert(typeof user.password === 'string');
    assert(typeof user.email === 'string');
    assert(typeof user.privatePemCipher === 'string');
    assert(typeof user.publicPem === 'object');
    assert(typeof user.admin === 'boolean');
    assert(typeof user.salt === 'string');
    assert(typeof callback === 'function');

    user.id = userId;

    debug('add: ' + JSON.stringify(user));

    db.put(user, function (error) {
        callback(error);
    });
}

function del(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    debug('del: ' + userId);

    db.remove(userId, function (error) {
        callback(error);
    });
}

function getByAccessToken(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    debug('getByAccessToken: ' +  accessToken);

    tokendb.get(accessToken, function (error, result) {
        if (error) return callback(error);

        get(result.userId, function (error, result) {
            if (error) return callback(error);
            callback(null, result);
        });
    });
}

function clear(callback) {
    assert(db !== null);

    db.removeAll(callback);
}

function update(userId, user, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof user.username === 'string');
    assert(typeof user.password === 'string');
    assert(typeof user.email === 'string');
    assert(typeof user.privatePemCipher === 'string');
    assert(typeof user.publicPem === 'object');
    assert(typeof user.admin === 'boolean');
    assert(typeof user.salt === 'string');
    assert(typeof callback === 'function');

    user.id = userId;

    debug('update: ' + JSON.stringify(user));

    db.update(user, function (error) {
        callback(error);
    });
}

function count() {
    assert(db !== null);

    return db.count();
}
