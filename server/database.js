'use strict';

var fs = require('fs'),
    util = require('util');

var rootDir = '';

exports = module.exports = {
    // tables
    USERS_TABLE: null,

    initializeSync: initializeSync,
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

function Table(dbFile, schema) {
    this.dbFile = dbFile;
    this.schema = schema;

    for (var p in schema) {
        if (schema[p].hashKey === true) this.hashKey = p;
        else if (schema[p].rangeKey === true) this.rangeKey = p;
    }

    if (!('hashKey' in this)) throw(new Error('Table does not define a primary key'));
}

Table.prototype.put = function (user, callback) {
    fs.writeFile(this.dbFile, JSON.stringify(user), callback);
};

function initializeSync(dbDir) {
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

    rootDir = dbDir;

    exports.USERS_TABLE = new Table(rootDir + '/users', {
        username: { type: 'String', hashKey: true },
        email: { type: 'String' },
        password: { type: 'String', priv: true },
        salt: { type: 'String', priv: true },
        created_at: { type: 'String' },
        modified_at: { type: 'String' }
    });

    return true;
}

function firstTime() {
    return !fs.existsSync(rootDir + '/users');
}

