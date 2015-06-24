'use strict';


exports.get = get;
exports.getByUsername = getByUsername;
exports.getByEmail = getByEmail;
exports.getByAccessToken = getByAccessToken;
exports.getByResetToken = getByResetToken;
exports.getAll = getAll;
exports.getAllAdmins = getAllAdmins;
exports.add = add;
exports.del = del;
exports.update = update;
exports.count = count;
exports.adminCount = adminCount;

exports._clear = clear;


var assert = require('assert'),
    database = require('./database.js'),
    debug = require('debug')('box:userdb'),
    DatabaseError = require('./databaseerror');

var USERS_FIELDS = [ 'id', 'username', 'email', 'password', 'salt', 'createdAt', 'modifiedAt', 'admin', 'resetToken' ].join(',');

function get(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE id = ?', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function getByUsername(username, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof callback, 'function');

    // currently username is also our id
    get(username, callback);
}

function getByEmail(email, callback) {
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE email = ?', [ email ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function getByResetToken(resetToken, callback) {
    assert.strictEqual(typeof resetToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (resetToken.length === 0) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, 'Empty resetToken not allowed'));

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE resetToken=?', [ resetToken ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function getAllAdmins(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE admin=1', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null, results);
    });
}

function add(userId, user, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof user.username, 'string');
    assert.strictEqual(typeof user.password, 'string');
    assert.strictEqual(typeof user.email, 'string');
    assert.strictEqual(typeof user.admin, 'boolean');
    assert.strictEqual(typeof user.salt, 'string');
    assert.strictEqual(typeof user.createdAt, 'string');
    assert.strictEqual(typeof user.modifiedAt, 'string');
    assert.strictEqual(typeof user.resetToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    var data = [ userId, user.username, user.password, user.email, user.admin, user.salt, user.createdAt, user.modifiedAt, user.resetToken ];
    database.query('INSERT INTO users (id, username, password, email, admin, salt, createdAt, modifiedAt, resetToken) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
           data, function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('DELETE FROM users WHERE id = ?', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(error);
    });
}

function getByAccessToken(accessToken, callback) {
    assert.strictEqual(typeof accessToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('getByAccessToken: ' +  accessToken);

    database.query('SELECT ' + USERS_FIELDS + ' FROM users, tokens WHERE tokens.accessToken = ?', [ accessToken ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, result[0]);
    });
}

function clear(callback) {
    database.query('DELETE FROM users', function (error) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(error);
    });
}

function update(userId, user, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof callback, 'function');

    var args = [ ];
    var fields = [ ];
    for (var k in user) {
        fields.push(k + ' = ?');
        args.push(user[k]);
    }
    args.push(userId);

    database.query('UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?', args, function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        return callback(null);
    });
}

function count(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT COUNT(*) AS total FROM users', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null, result[0].total);
    });
}

function adminCount(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT COUNT(*) AS total FROM users WHERE admin=1', function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        return callback(null, result[0].total);
    });
}

