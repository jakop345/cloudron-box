'use strict';

var DatabaseError = require('./databaseerror'),
    debug = require('debug')('clientdb'),
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

function get(id, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof callback === 'function');

    if (!db[id]) return callback(new DatabaseError(DatabaseError.NOT_FOUND));
    callback(null, db[id]);
}

function add(id, data, callback) {
    assert(db !== null);
    assert(typeof id === 'string');
    assert(typeof data === 'object');
    assert(typeof callback === 'function');

    data.id = id;

    if (db[id]) return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS));
    db[id] = data;

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
