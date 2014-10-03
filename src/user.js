'use strict';

var userdb = require('./userdb.js'),
    DatabaseError = require('./databaseerror.js'),
    crypto = require('crypto'),
    aes = require('../src/aes-helper.js'),
    util = require('util'),
    debug = require('debug')('box:user'),
    assert = require('assert'),
    ursa = require('ursa'),
    safe = require('safetydance'),
    mailer = require('./mailer.js'),
    database = require('./database');

exports = module.exports = {
    UserError: UserError,

    list: listUsers,
    create: createUser,
    verify: verifyUser,
    remove: removeUser,
    get: getUser,
    changeAdmin: changeAdmin,
    changePassword: changePassword,
    update: updateUser,
    clear: clear
};

var CRYPTO_SALT_SIZE = 64; // 512-bit salt
var CRYPTO_ITERATIONS = 10000; // iterations
var CRYPTO_KEY_LENGTH = 512; // bits

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function UserError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = safe.JSON.stringify(err);
    this.code = err ? err.code : null;
    this.reason = reason || UserError.INTERNAL_ERROR;
}
util.inherits(UserError, Error);
UserError.DATABASE_ERROR = 1;
UserError.INTERNAL_ERROR = 2;
UserError.ALREADY_EXISTS = 3;
UserError.NOT_FOUND = 4;
UserError.WRONG_USER_OR_PASSWORD = 5;
UserError.ARGUMENTS = 6;
UserError.NOT_ALLOWED = 7;

function ensureArgs(args, expected) {
    assert(args.length === expected.length);

    for (var i = 0; i < args.length; ++i) {
        if (expected[i]) {
            assert(typeof args[i] === expected[i]);
        }
    }
}

function listUsers(callback) {
    ensureArgs(arguments, ['function']);

    userdb.getAll(function (error, result) {
        if (error) {
            debug('Unable to get all users.', error);
            return callback(new UserError('Unable to list users', UserError.DATABASE_ERROR));
        }

        return callback(null, result.map(database.removePrivates));
    });
}

function createUser(username, password, email, admin, callback) {
    ensureArgs(arguments, ['string', 'string', 'string', 'boolean', 'function']);

    if (username.length === 0) {
        return callback(new UserError('username empty', UserError.ARGUMENTS));
    }

    if (password.length === 0) {
        return callback(new UserError('password empty', UserError.ARGUMENTS));
    }

    if (email.length === 0) {
        return callback(new UserError('email empty', UserError.ARGUMENTS));
    }

    crypto.randomBytes(CRYPTO_SALT_SIZE, function (error, salt) {
        if (error) {
            return callback(new UserError('Failed to generate random bytes', UserError.INTERNAL_ERROR));
        }

        crypto.pbkdf2(password, salt, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) {
                return callback(new UserError('Failed to hash password', UserError.INTERNAL_ERROR));
            }

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
                if (error) {
                    if (error.reason === DatabaseError.ALREADY_EXISTS) {
                        return callback(new UserError('Already exists', UserError.ALREADY_EXISTS));
                    }
                    return callback(error);
                }

                callback(null, user);

                mailer.userAdded(user);
            });
        });
    });
}

function verifyUser(username, password, callback) {
    ensureArgs(arguments, ['string', 'string', 'function']);

    if (username.length === 0) {
        return callback(new UserError('username empty', UserError.ARGUMENTS));
    }

    if (password.length === 0) {
        return callback(new UserError('password empty', UserError.ARGUMENTS));
    }

    userdb.get(username, function (error, user) {
        if (error) {
            if (error.reason === DatabaseError.NOT_FOUND) {
                return callback(new UserError('Username not found', UserError.NOT_FOUND));
            }

            return callback(error);
        }

        var saltBinary = new Buffer(user._salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) {
                return callback(new UserError('Failed to hash password', UserError.INTERNAL_ERROR));
            }

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== user._password)  {
                return callback(new UserError('Username and password do not match', UserError.WRONG_USER_OR_PASSWORD));
            }

            callback(null, user);
        });
    });
}

function removeUser(username, callback) {
    ensureArgs(arguments, ['string', 'function']);

    // TODO we might want to cleanup volumes assigned to this user as well - Johannes
    userdb.del(username, function (error, user) {
        if (error) return callback(error);
        callback(null, user);

        mailer.userRemoved(user);
    });
}

function getUser(username, callback) {
    ensureArgs(arguments, ['string', 'function']);

    userdb.get(username, function (error, result) {
        if (error) return callback(error);
        return callback(null, result);
    });
}

function updateUser(username, callback) {
    ensureArgs(arguments, ['string', 'object', 'function']);

    callback(new UserError('not implemented', UserError.INTERNAL_ERROR));
}

function changeAdmin(username, admin, callback) {
    ensureArgs(arguments, ['string', 'boolean', 'function']);

    getUser(username, function (error, user) {
        if (error) return callback(error);

        userdb.getAllAdmins(function (error, result) {
            if (error) return callback(error);

            // protect from a system where there is no admin left
            if (result.length <= 1 && !admin) return callback(new UserError('last admin', UserError.NOT_ALLOWED));

            user.admin = admin;

            userdb.update(username, user, function (error) {
                if (error) return callback(error);

                callback(null);

                mailer.adminChanged(user);
            });
        });
    });
}

function changePassword(username, oldPassword, newPassword, callback) {
    ensureArgs(arguments, ['string', 'string', 'string', 'function']);

    if (newPassword.length === 0) {
        debug('Empty passwords are not allowed.');
        return callback(new UserError('No empty passwords allowed', UserError.INTERNAL_ERROR));
    }

    verifyUser(username, oldPassword, function (error, user) {
        if (error) return callback(error);

        var saltBuffer = new Buffer(user._salt, 'hex');
        crypto.pbkdf2(newPassword, saltBuffer, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) {
                return callback(new UserError('Failed to hash password', UserError.INTERNAL_ERROR));
            }

            var privateKeyPem = aes.decrypt(user._privatePemCipher, oldPassword, saltBuffer);
            var keyPair = ursa.createPrivateKey(privateKeyPem, oldPassword, 'utf8');

            user.modifiedAt = (new Date()).toUTCString();
            user._password = new Buffer(derivedKey, 'binary').toString('hex');
            user._privatePemCipher = aes.encrypt(keyPair.toPrivatePem(), newPassword, saltBuffer);

            userdb.update(username, user, function (error) {
                if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError('User does not exist', UserError.NOT_FOUND));
                if (error) return callback(error);

                callback(null, user);
            });
        });
    });
}

function clear(callback) {
    ensureArgs(arguments, ['function']);

    userdb.clear(callback);
}
