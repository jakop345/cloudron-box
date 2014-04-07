'use strict';

var DatabaseError = require('./databaseerror'),
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

    db = {};

    callback(null);
}

function get(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    debug('get: ' + id);

    if (!db[id]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    callback(null, db[id]);
}

function getByClientId(clientId, callback) {
    assert(db !== null);
    assert(typeof clientId === 'string');
    assert(typeof callback === 'function');

    debug('getByClientId: ' + clientId);

    for (var record in db) {
        if (db.hasOwnProperty(record)) {
            if (db[record].clientId === clientId) {
                return callback(null, db[record]);
            }
        }
    }

    return callback(new DatabaseError(DatabaseError.NOT_FOUND));
}

function add(id, redirectURI, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof redirectURI === 'string');
    assert(typeof callback === 'function');

    debug('add: ' + id + ' redirectURI "' + redirectURI + '"');

    if (db[id]) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));

    db[id] = {
        id: id,
        redirectURI: redirectURI
    };

    callback(null);
}

function del(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    if (!db[id]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    delete db[id];

    callback(null);
}
