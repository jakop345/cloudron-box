'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    uuid = require('node-uuid'),
    debug = require('debug')('authserver:tokendb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    generateToken: generateToken,
    get: get,
    getByUserId: getByUserId,
    add: add,
    del: del,
    delByUserId: delByUserId
};

function init(configDir, callback) {
    assert(typeof configDir === 'string');
    assert(typeof callback === 'function');

    db = new DatabaseTable(path.join(configDir, 'db/token'), {
        accessToken: { type: 'String', hashKey: true },
        userId: { type: 'String' },
        clientId: { type: 'String' },
        expires: { type: 'String' }
    });

    debug('init: ' + path.join(configDir, 'db/token'));

    callback(null);
}

function generateToken() {
    return uuid.v4();
}

function get(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    debug('get: ' + accessToken);

    db.get(accessToken, function (error, result) {
        callback(error, result);
    });
}

function add(accessToken, userId, clientId, expires, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof userId === 'string');
    assert(typeof clientId === 'string' || clientId === null);
    assert(typeof expires === 'string');
    assert(typeof callback === 'function');

    var data = {
        accessToken: accessToken,
        userId: userId,
        clientId: clientId,
        expires: expires
    };

    debug('add: ' + JSON.stringify(data));

    db.put(data, function (error) {
        callback(error);
    });
}

function del(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    debug('del: ' + accessToken);

    db.remove(accessToken, function (error) {
        callback(error);
    });
}

function getByUserId(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    debug('getByUserId: ' + userId);

    db.getAll(true, function (error, result) {
        if (error) return callback(error);

        for (var i in result) {
            if (result.hasOwnProperty(i)) {
                if (result[i] === userId) {
                    return callback(null, i);
                }
            }
        }

        callback(new DatabaseError(DatabaseError.NOT_FOUND));
    });
}

function delByUserId(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    debug('delByUserId: ' + userId);

    getByUserId(userId, function (error, result) {
        if (error) return callback(error);

        db.remove(result.accessToken, function (error) {
            callback(error);
        });
    });
}
