'use strict';

var db = require('./database.js'),
    DatabaseError = db.DatabaseError,
    crypto = require('crypto'),
    util = require('util'),
    debug = require('debug')('user.js'),
    assert = require('assert');

exports = module.exports = {
    UserError: UserError,

    create: createUser,
    verify: verifyUser,
    remove: removeUser,
    changePassword: changePassword,
    update: updateUser,
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
    this.message = JSON.stringify(err);
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

function ensureArgs(args, expected) {
    assert(args.length === expected.length);

    for (var i = 0; i < args.length; ++i) {
        if (expected[i]) {
            assert(typeof args[i] === expected[i]);
        }
    }
}

function createUser(username, password, email, options, callback) {
    ensureArgs(arguments, ['string', 'string', 'string', 'object', 'function']);

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

            var now = (new Date()).toUTCString();
            var admin = !(db.USERS_TABLE.count()); // currently the first user is the admin
            var user = {
                username: username,
                email: email,
                password: new Buffer(derivedKey, 'binary').toString('hex'),
                admin: admin,
                salt: salt.toString('hex'),
                created_at: now,
                updated_at: now
            };

            db.USERS_TABLE.put(user, function (error) {
                if (error) {
                    if (error.reason === DatabaseError.ALREADY_EXISTS) {
                        return callback(new UserError('Already exists', UserError.ALREADY_EXISTS));
                    }
                    return callback(error);
                }

                callback(null, {username: username, email: email});
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

    db.USERS_TABLE.get(username, function (error, user) {
        if (error) {
            if (error.reason === DatabaseError.NOT_FOUND) {
                return callback(new UserError('Username not found', UserError.NOT_FOUND));
            }

            return callback(error);
        }

        var saltBinary = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) {
                return callback(new UserError('Failed to hash password', UserError.INTERNAL_ERROR));
            }

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex != user.password)  {
                return callback(new UserError('Username and password does not match', UserError.WRONG_USER_OR_PASSWORD));
            }

            callback(null, { username: user.username, email: user.email });
        });
    });
}

function removeUser(username, password, callback) {
    ensureArgs(arguments, ['string', 'string', 'function']);

    verifyUser(username, password, function (error, result) {
        if (error) {
            return callback(error);
        }

        // TODO we might want to cleanup volumes assigned to this user as well - Johannes
        db.USERS_TABLE.remove(username, function (error, user) {
            if (error) {
                return callback(error);
            }

            callback(null, user);
        });
    });
}

function updateUser(username, password, options, callback) {
    ensureArgs(arguments, ['string', 'string', 'object', 'function']);

    verifyUser(username, password, function (error, result) {
        if (error) {
            return callback(error);
        }

        callback(new UserError('not implemented', UserError.INTERNAL_ERROR));
    });
}

function changePassword(username, oldPassword, newPassword, callback) {
    ensureArgs(arguments, ['string', 'string', 'string', 'function']);

    verifyUser(username, oldPassword, function (error, result) {
        if (error) {
            return callback(error);
        }

        callback(new UserError('not implemented', UserError.INTERNAL_ERROR));
    });
}
