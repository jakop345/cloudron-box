/* jshint node:true */

'use strict';

exports = module.exports = {
    UserError: UserError,

    list: listUsers,
    create: createUser,
    verify: verify,
    verifyWithEmail: verifyWithEmail,
    remove: removeUser,
    get: getUser,
    getByResetToken: getByResetToken,
    changeAdmin: changeAdmin,
    getAllAdmins: getAllAdmins,
    resetPasswordByIdentifier: resetPasswordByIdentifier,
    setPassword: setPassword,
    changePassword: changePassword,
    update: updateUser,
    createOwner: createOwner,
    getOwner: getOwner,
    sendInvite: sendInvite
};

var assert = require('assert'),
    clientdb = require('./clientdb.js'),
    crypto = require('crypto'),
    DatabaseError = require('./databaseerror.js'),
    groups = require('./groups.js'),
    hat = require('hat'),
    mailer = require('./mailer.js'),
    tokendb = require('./tokendb.js'),
    userdb = require('./userdb.js'),
    util = require('util'),
    validatePassword = require('./password.js').validate,
    validator = require('validator'),
    _ = require('underscore');

var CRYPTO_SALT_SIZE = 64; // 512-bit salt
var CRYPTO_ITERATIONS = 10000; // iterations
var CRYPTO_KEY_LENGTH = 512; // bits

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function UserError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(UserError, Error);
UserError.INTERNAL_ERROR = 'Internal Error';
UserError.ALREADY_EXISTS = 'Already Exists';
UserError.NOT_FOUND = 'Not Found';
UserError.WRONG_PASSWORD = 'Wrong User or Password';
UserError.BAD_FIELD = 'Bad field';
UserError.BAD_USERNAME = 'Bad username';
UserError.BAD_EMAIL = 'Bad email';
UserError.BAD_PASSWORD = 'Bad password';
UserError.BAD_TOKEN = 'Bad token';
UserError.NOT_ALLOWED = 'Not Allowed';

function listUsers(callback) {
    assert.strictEqual(typeof callback, 'function');

    userdb.getAll(function (error, result) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, result.map(function (obj) { return _.pick(obj, 'id', 'username', 'email', 'displayName'); }));
    });
}

function validateUsername(username) {
    assert.strictEqual(typeof username, 'string');

    if (username.length <= 2) return new UserError(UserError.BAD_USERNAME, 'Username must be atleast 3 chars');
    if (username.length > 256) return new UserError(UserError.BAD_USERNAME, 'Username too long');

    return null;
}

function validateEmail(email) {
    assert.strictEqual(typeof email, 'string');

    if (!validator.isEmail(email)) return new UserError(UserError.BAD_EMAIL, 'Invalid email');

    return null;
}

function validateToken(token) {
    assert.strictEqual(typeof token, 'string');

    if (token.length !== 64) return new UserError(UserError.BAD_TOKEN, 'Invalid token'); // 256-bit hex coded token

    return null;
}

function validateDisplayName(name) {
    assert.strictEqual(typeof name, 'string');

    return null;
}

function createUser(username, password, email, displayName, invitor, sendInvite, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof displayName, 'string');
    assert(invitor);
    assert.strictEqual(typeof sendInvite, 'boolean');
    assert.strictEqual(typeof callback, 'function');

    var error = validateUsername(username);
    if (error) return callback(error);

    error = validatePassword(password);
    if (error) return callback(new UserError(UserError.BAD_PASSWORD, error.message));

    error = validateEmail(email);
    if (error) return callback(error);

    error = validateDisplayName(displayName);
    if (error) return callback(error);

    crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        crypto.pbkdf2(password, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var now = (new Date()).toISOString();
            var user = {
                id: username,
                username: username,
                email: email,
                password: new Buffer(derivedKey, 'binary').toString('hex'),
                salt: salt.toString('hex'),
                createdAt: now,
                modifiedAt: now,
                resetToken: hat(256),
                displayName: displayName
            };

            userdb.add(user.id, user, function (error) {
                if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null, user);

                if (sendInvite) mailer.sendInvite(user, invitor);
            });
        });
    });
}

function verify(username, password, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.get(username, function (error, user) {
        if (error && error.reason == DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        var saltBinary = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== user.password) return callback(new UserError(UserError.WRONG_PASSWORD));

            callback(null, user);
        });
    });
}

function verifyWithEmail(email, password, callback) {
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.getByEmail(email, function (error, user) {
        if (error && error.reason == DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        var saltBinary = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== user.password) return callback(new UserError(UserError.WRONG_PASSWORD));

            callback(null, user);
        });
    });
}

function removeUser(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.del(userId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        callback(null);

        mailer.userRemoved(userId);
    });
}

function getUser(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.get(userId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function getByResetToken(resetToken, callback) {
    assert.strictEqual(typeof resetToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateToken(resetToken);
    if (error) return callback(error);

    userdb.getByResetToken(resetToken, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        callback(null, result);
    });
}

function updateUser(userId, username, email, displayName, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof displayName, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validateUsername(username);
    if (error) return callback(error);

    error = validateEmail(email);
    if (error) return callback(error);

    userdb.update(userId, { username: username, email: email, displayName: displayName }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND, error));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));
        callback(null);
    });
}

function changeAdmin(username, admin, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof admin, 'boolean');
    assert.strictEqual(typeof callback, 'function');

    getUser(username, function (error, user) {
        if (error) return callback(error);

        userdb.getAllAdmins(function (error, result) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            // protect from a system where there is no admin left
            if (result.length <= 1 && !admin) return callback(new UserError(UserError.NOT_ALLOWED, 'Only admin'));

            user.admin = admin;

            userdb.update(username, user, function (error) {
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null);

                mailer.adminChanged(user);
            });
        });
    });
}

function getAllAdmins(callback) {
    assert.strictEqual(typeof callback, 'function');

    userdb.getAllAdmins(function (error, admins) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));
        callback(null, admins);
    });
}

function resetPasswordByIdentifier(identifier, callback) {
    assert.strictEqual(typeof identifier, 'string');
    assert.strictEqual(typeof callback, 'function');

    var getter;
    if (identifier.indexOf('@') === -1) getter = userdb.getByUsername;
    else getter = userdb.getByEmail;

    getter(identifier, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        result.resetToken = hat(256);

        userdb.update(result.id, result, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            mailer.passwordReset(result);

            callback(null);
        });
    });
}

function setPassword(userId, newPassword, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof newPassword, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validatePassword(newPassword);
    if (error) return callback(new UserError(UserError.BAD_PASSWORD, error.message));

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        var saltBuffer = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(newPassword, saltBuffer, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            user.modifiedAt = (new Date()).toISOString();
            user.password = new Buffer(derivedKey, 'binary').toString('hex');
            user.resetToken = '';

            userdb.update(userId, user, function (error) {
                if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                // Also generate a token so the new user can get logged in immediately
                clientdb.getByAppIdAndType('webadmin', clientdb.TYPE_ADMIN, function (error, result) {
                    if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                    var token = tokendb.generateToken();
                    var expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 1 day

                    tokendb.add(token, tokendb.PREFIX_USER + user.id, result.id, expiresAt, '*', function (error) {
                        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                        callback(null, { token: token, expiresAt: expiresAt });
                    });
                });
            });
        });
    });
}

function changePassword(username, oldPassword, newPassword, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof oldPassword, 'string');
    assert.strictEqual(typeof newPassword, 'string');
    assert.strictEqual(typeof callback, 'function');

    var error = validatePassword(newPassword);
    if (error) return callback(new UserError(UserError.BAD_PASSWORD, error.message));

    verify(username, oldPassword, function (error, user) {
        if (error) return callback(error);

        setPassword(user.id, newPassword, callback);
    });
}

function createOwner(username, password, email, displayName, callback) {
    userdb.count(function (error, count) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));
        if (count !== 0) return callback(new UserError(UserError.ALREADY_EXISTS));

        createUser(username, password, email, displayName, null /* invitor */, false /* sendInvite */, function (error) {
            if (error) return callback(error);

            groups.addMember(groups.ADMIN_GROUP_ID, username, function (error) {
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback();
            });
        });
    });
}

function getOwner(callback) {
    userdb.getOwner(function (error, owner) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, owner);
    });
}

function sendInvite(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.get(userId, function (error, userObject) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        userObject.resetToken = hat(256);

        userdb.update(userId, userObject, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            mailer.sendInvite(userObject, null);

            callback(null);
        });
    });
}
