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
    resetPasswordByIdentifier: resetPasswordByIdentifier,
    setPassword: setPassword,
    changePassword: changePassword,
    update: updateUser
};

var assert = require('assert'),
    crypto = require('crypto'),
    database = require('./database'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:user'),
    mailer = require('./mailer.js'),
    uuid = require('node-uuid'),
    userdb = require('./userdb.js'),
    util = require('util'),
    validator = require('validator'),
    _ = require('underscore');

var resetTokens = {};

var CRYPTO_SALT_SIZE = 64; // 512-bit salt
var CRYPTO_ITERATIONS = 10000; // iterations
var CRYPTO_KEY_LENGTH = 512; // bits

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function UserError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
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
UserError.NOT_ALLOWED = 'Not Allowed';

function listUsers(callback) {
    assert(typeof callback === 'function');

    userdb.getAll(function (error, result) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, result.map(function (obj) { return _.pick(obj, 'id', 'username', 'email', 'admin'); }));
    });
}

function validateUsername(username) {
    assert(typeof username === 'string');

    if (username.length <= 2) return new UserError(UserError.BAD_USERNAME, 'Username must be atleast 3 chars');
    if (username.length > 256) return new UserError(UserError.BAD_USERNAME, 'Username too long');

    return null;
}

function validatePassword(password) {
    assert(typeof password === 'string');

    if (password.length < 5) return new UserError(UserError.BAD_PASSWORD, 'Password must be atleast 5 chars');

    return null;
}

function validateEmail(email) {
    assert(typeof email === 'string');

    if (!validator.isEmail(email)) return new UserError(UserError.BAD_EMAIL, 'Invalid email');

    return null;
}

function createUser(username, password, email, admin, callback) {
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof email === 'string');
    assert(typeof admin === 'boolean');
    assert(typeof callback === 'function');

    var error = validateUsername(username);
    if (error) return callback(error);

    error = validatePassword(password);
    if (error) return callback(error);

    error = validateEmail(email);
    if (error) return callback(error);

    crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        crypto.pbkdf2(password, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var now = (new Date()).toUTCString();
            var user = {
                id: username,
                username: username,
                email: email,
                password: new Buffer(derivedKey, 'binary').toString('hex'),
                admin: admin,
                salt: salt.toString('hex'),
                createdAt: now,
                modifiedAt: now
            };

            userdb.add(user.id, user, function (error) {
                if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null, user);

                resetTokens[user.id] = uuid.v4();

                // only send welcome mail if user is not an admin. This i only the case for the first user!
                // The welcome email contains a link to create a new password
                if (!user.admin) mailer.userAdded(user, resetTokens[user.id]);
            });
        });
    });
}

function verify(username, password, callback) {
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof callback === 'function');

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
    assert(typeof email === 'string');
    assert(typeof password === 'string');
    assert(typeof callback === 'function');

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

function removeUser(username, callback) {
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    userdb.del(username, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        callback(null);

        mailer.userRemoved(username);
    });
}

function getUser(userId, callback) {
    assert(typeof userId === 'string');
    assert(typeof callback === 'function');

    userdb.get(userId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
}

function getByResetToken(resetToken, callback) {
    assert(typeof resetToken === 'string');
    assert(typeof callback === 'function');

    var userId = null;
    for (var id in resetTokens) {
        if (resetTokens[id] === resetToken) {
            userId = id;
            break;
        }
    }

    if (!userId) return callback(new UserError(UserError.NOT_FOUND));
    getUser(userId, callback);
}

function updateUser(username, callback) {
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    callback(new UserError(UserError.INTERNAL_ERROR, 'Not implemented'));
}

function changeAdmin(username, admin, callback) {
    assert(typeof username === 'string');
    assert(typeof admin === 'boolean');
    assert(typeof callback === 'function');

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

function resetPasswordByIdentifier(identifier, callback) {
    assert(typeof identifier === 'string');
    assert(typeof callback === 'function');

    var getter;
    if (identifier.indexOf('@') === -1) getter = userdb.getByUsername;
    else getter = userdb.getByEmail;

    getter(identifier, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        resetTokens[result.id] = uuid.v4();
        mailer.passwordReset(result, resetTokens[result.id]);

        callback(null);
    });
}

function setPassword(userId, newPassword, callback) {
    assert(typeof userId === 'string');
    assert(typeof newPassword === 'string');
    assert(typeof callback === 'function');

    var error = validatePassword(newPassword);
    if (error) return callback(error);

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        var saltBuffer = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(newPassword, saltBuffer, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            user.modifiedAt = (new Date()).toUTCString();
            user.password = new Buffer(derivedKey, 'binary').toString('hex');

            userdb.update(userId, user, function (error) {
                if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null);
            });
        });
    });
}

function changePassword(username, oldPassword, newPassword, callback) {
    assert(typeof username === 'string');
    assert(typeof oldPassword === 'string');
    assert(typeof newPassword === 'string');
    assert(typeof callback === 'function');

    var error = validatePassword(newPassword);
    if (error) return callback(error);

    verify(username, oldPassword, function (error, user) {
        if (error) return callback(error);

        setPassword(user.id, newPassword, callback);
    });
}

