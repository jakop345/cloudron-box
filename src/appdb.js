'use strict';

var DatabaseError = require('./databaseerror'),
    DatabaseTable = require('./databasetable'),
    path = require('path'),
    debug = require('debug')('authserver:appdb'),
    assert = require('assert');

// database
var db;

exports = module.exports = {
    init: init,
    get: get,
    add: add,
    del: del,
    clear: clear,
    update: update,
    count: count,
    getAll: getAll
};

function init(configDir) {
    assert(typeof configDir === 'string');

    db = new DatabaseTable(path.join(configDir, 'db/apps'), {
        id: { type: 'String', hashKey: true },
        status: { type: 'String' },
        config: { type: 'String' }
    });
}

function get(appId, callback) {
    assert(db !== null);
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('get: ' + appId);

    db.get(appId, function (error, result) {
        callback(error, result);
    });
}

function getAll(callback) {
    assert(db !== null);

    db.getAll(false /* privates */, callback);
}

function add(appId, app, callback) {
    assert(db !== null);
    assert(typeof appId === 'string');
    assert(typeof app.status === 'string');
    assert(typeof callback === 'function');

    app.id = appId;

    debug('add: ' + JSON.stringify(app));

    db.put(app, function (error) {
        callback(error);
    });
}

function del(appId, callback) {
    assert(db !== null);
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    debug('del: ' + appId);

    db.remove(appId, function (error) {
        callback(error);
    });
}

function clear(callback) {
    assert(db !== null);

    db.removeAll(callback);
}

function update(appId, app, callback) {
    assert(db !== null);
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    app.id = appId;

    debug('update: ' + JSON.stringify(app));

    db.update(app, function (error) {
        callback(error);
    });
}

function count() {
    assert(db !== null);

    return db.count();
}
