'use strict';

var fs = require('fs'),
    util = require('util');

var rootDir = '';

exports = module.exports = {
    // tables
    USERS_TABLE: null,
    TOKENS_TABLE: null,

    initialize: initialize,
    firstTime: firstTime,

    DatabaseError: DatabaseError,

    Table: Table
};

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function DatabaseError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = JSON.stringify(err);
    this.code = err ? err.code : null;
    this.reason = reason || DatabaseError.SERVER_ERROR;
    this.statusCode = 500; // any db error is a server error
}
util.inherits(DatabaseError, Error);
DatabaseError.SERVER_ERROR = 1;
DatabaseError.INTERNAL_ERROR = 2;
DatabaseError.ALREADY_EXISTS = 3;
DatabaseError.NOT_FOUND = 4;
DatabaseError.RECORD_SCHEMA = 5;

function Table(dbFile, schema) {
    this.dbFile = dbFile;
    this.schema = schema;

    for (var p in schema) {
        if (schema[p].hashKey === true) this.hashKey = p;
        else if (schema[p].rangeKey === true) this.rangeKey = p;
    }

    if (!('hashKey' in this)) throw(new Error('Table does not define a primary key'));

    try {
        var data = fs.readFileSync(this.dbFile);
        this.cache = data ? JSON.parse(data) : { };
    } catch (e) {
        this.cache = { };
    }
}

Table.prototype.put = function (obj, callback) {
    var key = obj[this.hashKey];
    if (!key) return callback(new DatabaseError('no hash key found', DatabaseError.RECORD_SCHEMA));
    if (key in this.cache) return callback(new DatabaseError(null, DatabaseError.ALREADY_EXISTS));

    this.cache[key] = obj;
    fs.writeFileSync(this.dbFile, JSON.stringify(this.cache));
    callback();
};

Table.prototype.update = function (obj, callback) {
    var key = obj[this.hashKey];
    if (!key) return callback(new DatabaseError('no hash key found', DatabaseError.RECORD_SCHEMA));
    if (!(key in this.cache)) return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

    this.cache[key] = obj;
    fs.writeFileSync(this.dbFile, JSON.stringify(this.cache));
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
        fs.writeFileSync(this.dbFile, JSON.stringify(this.cache));

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

Table.prototype.removePrivates = function (obj) {
    var res = { };

    for (var p in this.schema) {
        if (this.schema[p].priv || !(p in obj))
            continue;
        res[p] = obj[p]; // ## make deep copy?
    }

    return res;
};

function initialize(config) {
    rootDir = config.configRoot + '/db';
    if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir);

    exports.USERS_TABLE = new Table(rootDir + '/users', {
        username: { type: 'String', hashKey: true },
        email: { type: 'String' },
        password: { type: 'String', priv: true },
        salt: { type: 'String', priv: true },
        created_at: { type: 'String' },
        modified_at: { type: 'String' }
    });

    exports.TOKENS_TABLE = new Table(rootDir + '/tokens', {
        token: { type: 'String', hashKey: true },
        username: { type: 'String', priv: true },
        email: { type: 'String', priv: true },
        expires: { type: 'String' }
    });

    return true;
}

function firstTime() {
    return !fs.existsSync(rootDir + '/users');
}

