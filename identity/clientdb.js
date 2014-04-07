'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    debug = require('debug')('authserver:clientdb'),
    assert = require('assert');

// database
var db = null;

exports = module.exports = {
    init: init,
    get: get,
    getByClientId: getByClientId,
    add: add,
    del: del
};

function init(configDir, callback) {
    assert(typeof configDir === 'string');
    assert(typeof callback === 'function');

    db = new DatabaseTable(path.join(configDir, 'db/client'), {
        id: { type: 'String', hashKey: true },
        clientId: { type: 'String' },
        clientSecret: { type: 'String' },
        name: { type: 'String' },
        redirectURI: { type: 'String' }
    });

    callback(null);
}

function get(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    debug('get: ' + id);

    db.get(id, function (error, result) {
        callback(error, result);
    });
}

function getByClientId(clientId, callback) {
    assert(db !== null);
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    debug('getByClientId: ' + clientId);

    db.getAll(true, function (error, result) {
        if (error) callback(error);

        for (var record in result) {
            if (result.hasOwnProperty(record)) {
                if (result[record].clientId === clientId) {
                    return callback(null, result[record]);
                }
            }
        }

        callback(new DatabaseError(DatabaseError.NOT_FOUND));
    });
}

function add(id, clientId, clientSecret, name, redirectURI, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof clientId === 'string');
    assert(typeof clientSecret === 'string');
    assert(typeof name === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof callback === 'function');

    debug('add: ' + id + ' clientId "' + clientId + ' clientSecret "' + clientSecret + ' name "' + name + '" redirectURI "' + redirectURI + '"');

    var data = {
        id: id,
        clientId: clientId,
        clientSecret: clientSecret,
        name: name,
        redirectURI: redirectURI
    };

    db.put(data, function (error) {
        callback(error);
    });
}

function del(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    db.remove(id, function (error) {
        callback(error);
    });
}
