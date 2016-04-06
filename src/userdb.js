'use strict';

exports = module.exports = {
    get: get,
    getByUsername: getByUsername,
    getByEmail: getByEmail,
    getByAccessToken: getByAccessToken,
    getByResetToken: getByResetToken,
    getOwner: getOwner,
    getAllWithGroupIds: getAllWithGroupIds,
    getAllAdmins: getAllAdmins,
    add: add,
    del: del,
    update: update,
    count: count,

    _clear: clear
};

var assert = require('assert'),
    database = require('./database.js'),
    debug = require('debug')('box:userdb'),
    DatabaseError = require('./databaseerror'),
    groups = require('./groups.js');

var USERS_FIELDS = [ 'id', 'username', 'email', 'password', 'salt', 'createdAt', 'modifiedAt', 'resetToken', 'displayName' ].join(',');

function postProcess(result) {
    assert.strictEqual(typeof result, 'object');

    // The username may be null or undefined in the db, let's ensure it is a string
    result.username = result.username || '';

    return result;
}

function get(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE id = ?', [ userId ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, postProcess(result[0]));
    });
}

function getByUsername(username, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE username = ?', [ username ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, postProcess(result[0]));
    });
}

function getByEmail(email, callback) {
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE email = ?', [ email ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, postProcess(result[0]));
    });
}

function getOwner(callback) {
    assert.strictEqual(typeof callback, 'function');

    // the first created user it the admin
    database.query('SELECT ' + USERS_FIELDS + ' FROM users, groupMembers WHERE groupMembers.groupId = ? AND users.id = groupMembers.userId ORDER BY createdAt LIMIT 1',
            [ groups.ADMIN_GROUP_ID ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, postProcess(result[0]));
    });
}

function getByResetToken(resetToken, callback) {
    assert.strictEqual(typeof resetToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (resetToken.length === 0) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, 'Empty resetToken not allowed'));

    database.query('SELECT ' + USERS_FIELDS + ' FROM users WHERE resetToken=?', [ resetToken ], function (error, result) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result.length === 0) return callback(new DatabaseError(DatabaseError.NOT_FOUND));

        callback(null, postProcess(result[0]));
    });
}

function getAllWithGroupIds(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ',GROUP_CONCAT(groupMembers.groupId) AS groupIds ' +
                    ' FROM users LEFT OUTER JOIN groupMembers ON users.id = groupMembers.userId ' +
                    ' GROUP BY users.id', function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results.forEach(function (result) {
            result.groupIds = result.groupIds ? result.groupIds.split(',') : [ ];
        });

        results.forEach(postProcess);

        callback(null, results);
    });
}

function getAllAdmins(callback) {
    assert.strictEqual(typeof callback, 'function');

    database.query('SELECT ' + USERS_FIELDS + ' FROM users, groupMembers WHERE groupMembers.groupId = ? AND users.id = groupMembers.userId ORDER BY username', [ groups.ADMIN_GROUP_ID ], function (error, results) {
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        results.forEach(postProcess);

        callback(null, results);
    });
}

function add(userId, user, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof user.username, 'string');
    assert.strictEqual(typeof user.password, 'string');
    assert.strictEqual(typeof user.email, 'string');
    assert.strictEqual(typeof user.salt, 'string');
    assert.strictEqual(typeof user.createdAt, 'string');
    assert.strictEqual(typeof user.modifiedAt, 'string');
    assert.strictEqual(typeof user.resetToken, 'string');
    assert.strictEqual(typeof user.displayName, 'string');
    assert.strictEqual(typeof callback, 'function');

    var data = [ userId, user.username || null, user.password, user.email.toLowerCase(), user.salt, user.createdAt, user.modifiedAt, user.resetToken, user.displayName ];
    database.query('INSERT INTO users (id, username, password, email, salt, createdAt, modifiedAt, resetToken, displayName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', data, function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
        if (error || result.affectedRows !== 1) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function del(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    // also cleanup the groupMembers table
    var queries = [];
    queries.push({ query: 'DELETE FROM groupMembers WHERE userId = ?', args: [ userId ] });
    queries.push({ query: 'DELETE FROM users WHERE id = ?', args: [ userId ] });

    database.transaction(queries, function (error, result) {
        if (error && error.code === 'ER_NO_REFERENCED_ROW_2') return callback(new DatabaseError(DatabaseError.NOT_FOUND, error));
        if (error) return callback(new DatabaseError(DatabaseError.INTERNAL_ERROR, error));
        if (result[1].affectedRows !== 1) return callback(new DatabaseError(DatabaseError.NOT_FOUND, error));

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

        callback(null, postProcess(result[0]));
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

        if (k === 'username') {
            assert.strictEqual(typeof user.username, 'string');
            args.push(user.username || null);
        } else if (k === 'email') {
            assert.strictEqual(typeof user.email, 'string');
            args.push(user.email.toLowerCase());
        } else {
            args.push(user[k]);
        }
    }
    args.push(userId);

    database.query('UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?', args, function (error, result) {
        if (error && error.code === 'ER_DUP_ENTRY') return callback(new DatabaseError(DatabaseError.ALREADY_EXISTS, error));
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
