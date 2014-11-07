/* jshint node:true */

'use strict';

var aes = require('../src/aes-helper.js'),
    assert = require('assert'),
    crypto = require('crypto'),
    database = require('./database'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:user'),
    mailer = require('./mailer.js'),
    safe = require('safetydance'),
    ursa = require('ursa'),
    userdb = require('./userdb.js'),
    util = require('util');

exports = module.exports = {
    UserError: UserError,

    list: listUsers,
    create: createUser,
    verify: verifyUser,
    remove: removeUser,
    get: getUser,
    changeAdmin: changeAdmin,
    resetPassword: resetPassword,
    changePassword: changePassword,
    update: updateUser,
    clear: clear
};

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
        this.internalError = errorOrMessage;
    }
}
util.inherits(UserError, Error);
UserError.INTERNAL_ERROR = 'Internal Error';
UserError.ALREADY_EXISTS = 'Already Exists';
UserError.NOT_FOUND = 'Not Found';
UserError.WRONG_USER_OR_PASSWORD = 'Wrong User or Password';
UserError.BAD_FIELD = 'Bad BAD_FIELD';
UserError.NOT_ALLOWED = 'Not Allowed';

function listUsers(callback) {
    assert(typeof callback === 'function');

    userdb.getAll(function (error, result) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, result.map(database.removePrivates));
    });
}

function validateUsername(username) {
    assert(typeof username === 'string');

    if (username.length <= 2) return new UserError(UserError.BAD_FIELD, 'Username must be atleast 3 chars');

    return null;

}

function validatePassword(password) {
    assert(typeof password === 'string');

    if (password.length <= 5) return new UserError(UserError.BAD_FIELD, 'Password must be atleast 5 chars');

    return null;
}

function validateEmail(email) {
    assert(typeof email === 'string');

    if (!/\S+@\S+/.test(email)) return new UserError(UserError.BAD_FIELD, 'Invalid email');

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

            // now generate the pub/priv keypairs for volume header
            var keyPair = ursa.generatePrivateKey(2048 /* modulusBits */, 65537 /* exponent */);

            var now = (new Date()).toUTCString();
            var user = {
                username: username,
                email: email,
                _password: new Buffer(derivedKey, 'binary').toString('hex'),
                _privatePemCipher: aes.encrypt(keyPair.toPrivatePem(), password, salt),
                publicPem: keyPair.toPublicPem().toString('hex'),
                admin: admin,
                _salt: salt.toString('hex'),
                createdAt: now,
                modifiedAt: now
            };

            userdb.add(username, user, function (error) {
                if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null, user);

                // only send welcome mail if user is not an admin. This i only the case for the first user!
                if (!user.admin) mailer.userAdded(user, password);
            });
        });
    });
}

function verifyUser(username, password, callback) {
    assert(typeof username === 'string');
    assert(typeof password === 'string');
    assert(typeof callback === 'function');

    var error = validateUsername(username);
    if (error) return callback(error);

    error = validatePassword(password);
    if (error) return callback(error);

    userdb.get(username, function (error, user) {
        if (error && error.reason == DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        var saltBinary = new Buffer(user._salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== user._password) return callback(new UserError(UserError.WRONG_USER_OR_PASSWORD));

            callback(null, user);
        });
    });
}

function removeUser(username, callback) {
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    userdb.del(username, function (error) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        callback(null);

        mailer.userRemoved(username);
    });
}

function getUser(username, callback) {
    assert(typeof username === 'string');
    assert(typeof callback === 'function');

    userdb.get(username, function (error, result) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null, result);
    });
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

function resetPassword(userId, newPassword, callback) {
    assert(typeof userId === 'string');
    assert(typeof newPassword === 'string');
    assert(typeof callback === 'function');

    var error = validatePassword(newPassword);
    if (error) return callback(error);

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        var saltBuffer = new Buffer(user._salt, 'hex');
        crypto.pbkdf2(newPassword, saltBuffer, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            // var privateKeyPem = aes.decrypt(user._privatePemCipher, oldPassword, saltBuffer);
            // var keyPair = ursa.createPrivateKey(privateKeyPem, oldPassword, 'utf8');
            var keyPair = ursa.generatePrivateKey(2048 /* modulusBits */, 65537 /* exponent */);

            user.modifiedAt = (new Date()).toUTCString();
            user._password = new Buffer(derivedKey, 'binary').toString('hex');
            user._privatePemCipher = aes.encrypt(keyPair.toPrivatePem(), newPassword, saltBuffer);

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

    if (newPassword.length === 0) return callback(new UserError(UserError.BAD_FIELD, 'Npm empty passwords allowed'));

    verifyUser(username, oldPassword, function (error, user) {
        if (error) return callback(error);

        var saltBuffer = new Buffer(user._salt, 'hex');
        crypto.pbkdf2(newPassword, saltBuffer, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var privateKeyPem = aes.decrypt(user._privatePemCipher, oldPassword, saltBuffer);
            var keyPair = ursa.createPrivateKey(privateKeyPem, oldPassword, 'utf8');

            user.modifiedAt = (new Date()).toUTCString();
            user._password = new Buffer(derivedKey, 'binary').toString('hex');
            user._privatePemCipher = aes.encrypt(keyPair.toPrivatePem(), newPassword, saltBuffer);

            userdb.update(username, user, function (error) {
                if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null, user);
            });
        });
    });
}

function clear(callback) {
    assert(typeof callback === 'function');

    userdb.clear(function (error) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        return callback(null);
    });
}

