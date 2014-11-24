'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    debug = require('debug')('box:userdb'),
    DatabaseError = require('./databaseerror'),
    path = require('path'),
    tokendb = require('./tokendb');

exports = module.exports = {
    get: get,
    getByUsername: getByUsername,
    getByEmail: getByEmail,
    getByAccessToken: getByAccessToken,
    getAll: getAll,
    getAllAdmins: getAllAdmins,
    add: add,
    del: del,
    clear: clear,
    update: update,
    count: count,
    adminCount: adminCount
};

var USERS_FIELDS = [ 'id', 'username', 'email', '_password', 'publicPem', '_privatePemCipher', '_salt', 'createdAt', 'modifiedAt', 'admin' ].join(',');

function get(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + USERS_FIELDS + ' FROM users WHERE id = ?', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getByUsername(username, callback) {
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    // currently username is also our id
    get(username, callback);
}

function getByEmail(email, callback) {
    assert(typeof email === 'string');
    assert(typeof callback === 'function');

    database.get('SELECT ' + USERS_FIELDS + ' FROM users WHERE email = ?', [ email ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    database.all('SELECT ' + USERS_FIELDS + ' FROM users', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, result);
    });
}

function getAllAdmins(callback) {
    assert(typeof callback === 'function');

    database.all('SELECT ' + USERS_FIELDS + ' FROM users WHERE admin=1', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, result);
    });
}

function add(userId, user, callback) {
    assert(typeof userId === 'string');
    assert(typeof user.username === 'string');
    assert(typeof user._password === 'string');
    assert(typeof user.email === 'string');
    assert(typeof user._privatePemCipher === 'string');
    assert(typeof user.publicPem === 'string');
    assert(typeof user.admin === 'boolean');
    assert(typeof user._salt === 'string');
    assert(typeof user.createdAt === 'string');
    assert(typeof user.modifiedAt === 'string');
    assert(typeof callback === 'function');

    var data = [ userId, user.username, user._password, user.email, user._privatePemCipher, user.publicPem,
                 user.admin, user._salt, user.createdAt, user.modifiedAt ];
    database.run('INSERT INTO users (id, username, _password, email, _privatePemCipher, publicPem, admin, _salt, createdAt, modifiedAt) '
           + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || !this.lastID) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    database.run('DELETE FROM users WHERE id = ?', [ userId ], function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(error);
    });
}

function getByAccessToken(accessToken, callback) {
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    debug('getByAccessToken: ' +  accessToken);

    database.get('SELECT ' + USERS_FIELDS + ' FROM users, tokens WHERE tokens.accessToken = ?', [ accessToken ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        if (typeof result === 'undefined') return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function clear(callback) {
    database.run('DELETE FROM users', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(error);
    });
}

function update(userId, user, callback) {
    assert(typeof userId === 'string');
    assert(typeof user === 'object');
    assert(typeof callback === 'function');

    var data = { $id: userId };
    var values = [ ];
    for (var k in user) {
        data['$' + k] = user[k];
        values.push(k + ' = $' + k);
    }

    database.run('UPDATE users SET ' + values.join(', ') + ' WHERE id = $id', data, function (error, result) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(DatabaseError.FIELD_ERROR, error));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (this.changes !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function count(callback) {
    assert(typeof callback === 'function');

    database.get('SELECT COUNT(*) AS total FROM users', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null, result.total);
    });
}

function adminCount(callback) {
    assert(typeof callback === 'function');

    database.get('SELECT COUNT(*) AS total FROM users WHERE admin=1', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null, result.total);
    });
}

