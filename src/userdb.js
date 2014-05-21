'use strict';

var DatabaseError = require('./databaseerror'),
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
    count: count
};

function init(_db) {
    assert(typeof _db === 'object');
    db = _db;
}

function get(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    db.get('SELECT * FROM users WHERE id = ?', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function getByUsername(username, callback) {
    assert(db !== null);
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    // currently username is also our id
    get(username, callback);
}

function getAll(callback) {
    assert(db !== null);
    assert(typeof callback === 'function');

    db.all('SELECT * FROM users', function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null, result);
    });
}

function add(userId, user, callback) {
    assert(db !== null);
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

    var data = {
        $id: userId,
        $username: user.username,
        $_password: user._password,
        $email: user.email,
        $_privatePemCipher: user._privatePemCipher,
        $publicPem: user.publicPem,
        $admin: user.admin,
        $_salt: user._salt,
        $createdAt: user.createdAt,
        $modifiedAt: user.modifiedAt
    };

    db.run('INSERT INTO users (id, username, _password, email, _privatePemCipher, publicPem, admin, _salt, createdAt, modifiedAt) '
           + 'VALUES ($id, $username, $_password, $email, $_privatePemCipher, $publicPem, $admin, $_salt, $createdAt, $modifiedAt)',
           data, function (error) {
        if (error && error.code === 'SQLITE_CONSTRAINT') return callback(new DatabaseError(error, DatabaseError.ALREADY_EXISTS));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(null);
    });
}

function del(userId, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    db.run('DELETE FROM users WHERE id = ?', [ userId ], function (error) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(error);
    });
}

function getByAccessToken(accessToken, callback) {
    assert(db !== null);
    assert(typeof accessToken === 'string');
    assert(typeof callback === 'function');

    debug('getByAccessToken: ' +  accessToken);

    db.get('SELECT * FROM users, tokens WHERE tokens.accessToken = ?', [ accessToken ], function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        if (typeof result === 'undefined') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));

        callback(null, result);
    });
}

function clear(callback) {
    assert(db !== null);

    db.run('DELETE FROM users', function (error) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        callback(error);
    });
}

function update(userId, user, callback) {
    assert(db !== null);
    assert(typeof userId === 'string');
    assert(typeof user === 'object');
    assert(typeof callback === 'function');

    var data = { $id: userId };
    var values = [ ];
    for (var k in user) {
        data['$' + k] = user[k];
        values.push(k + ' = $' + k);
    }

    db.run('UPDATE users SET ' + values.join(', ') + ' WHERE id = $id', data, function (error, result) {
        if (error && error.code === 'SQLITE_NOTFOUND') return callback(new DatabaseError(null, DatabaseError.NOT_FOUND));
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        return callback(null);
    });
}

function count(callback) {
    assert(db !== null);
    assert(typeof callback === 'function');

    db.get('SELECT COUNT(*) AS total FROM users', function (error, result) {
        if (error) return callback(new DatabaseError(error, DatabaseError.INTERNAL_ERROR));

        return callback(null, result.total);
    });
}
