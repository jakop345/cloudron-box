'use strict';

var fs = require('fs'),
    safe = require('safetydance'),
    path = require('path'),
    DatabaseError = require('./databaseerror'),
    mkdirp = require('mkdirp');

exports = module.exports = Table;

function Table(dbFile, schema) {
    this.dbFile = dbFile;
    this.schema = schema;

    // ensure the directory is there
    mkdirp.sync(path.dirname(dbFile));

    for (var p in schema) {
        if (schema[p].hashKey === true) this.hashKey = p;
        else if (schema[p].rangeKey === true) this.rangeKey = p;
    }

    if (!('hashKey' in this)) throw(new Error('Table does not define a primary key'));

    var data = safe.fs.readFileSync(this.dbFile);
    this.cache = safe.JSON.parse(data) || { };
}

Table.prototype.put = function (obj, callback) {
    var key = obj[this.hashKey];
    if (!key) return callback(new DatabaseError('no hash key found', DatabaseError.RECORD_SCHEMA));
    if (key in this.cache) return callback(new DatabaseError(null, DatabaseError.ALREADY_EXISTS));

    this.cache[key] = obj;
    fs.writeFileSync(this.dbFile, safe.JSON.stringify(this.cache, null, 4));
    callback();
};

Table.prototype.update = function (obj, callback) {
    var key = obj[this.hashKey];
    if (!key) return callback(new DatabaseError('no hash key found', DatabaseError.RECORD_SCHEMA));
    if (!(key in this.cache)) return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

    this.cache[key] = obj;
    fs.writeFileSync(this.dbFile, safe.JSON.stringify(this.cache, null, 4));
    callback();
};

Table.prototype.get = function (key, callback) {
    if (key in this.cache) return callback(null, this.cache[key]);
    return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
};

Table.prototype.count = function () {
    var i = 0;

    for (var e in this.cache) {
        if (this.cache.hasOwnProperty(e)) {
            ++i;
        }
    }

    return i;
};

Table.prototype.remove = function (key, callback) {
    var value = this.cache[key];
    if (value) {
        delete this.cache[key];
        fs.writeFileSync(this.dbFile, safe.JSON.stringify(this.cache, null, 4));

        return callback(null, value);
    }

    return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
};

// testing
Table.prototype.removeAll = function (callback) {
    this.cache = { };
    fs.writeFileSync(this.dbFile, '');
    return callback(null);
};

Table.prototype.getAll = function (privates, callback) {
    var result = [];

    for (var item in this.cache) {
        if (this.cache.hasOwnProperty(item)) {
            // TODO make deep copies?
            if (!privates) {
                result.push(this.removePrivates(this.cache[item]));
            } else {
                result.push(this.cache[item]);
            }
        }
    }

    return callback(null, result);
};


Table.prototype.removePrivates = function (obj) {
    var res = { };

    for (var p in obj) {
        if (!obj.hasOwnProperty(p)) continue;
        if (p.substring(0, 1) === '_') continue;
        res[p] = obj[p]; // ## make deep copy?
    }

    return res;
};

Table.prototype.count = function () {
    var i = 0;

    for (var e in this.cache) {
        if (this.cache.hasOwnProperty(e)) {
            ++i;
        }
    }

    return i;
};
