'use strict';

exports = module.exports = {
    UserError: UserError,

    list: listUsers,
    create: createUser,
    count: count,
    verify: verify,
    verifyWithUsername: verifyWithUsername,
    verifyWithEmail: verifyWithEmail,
    remove: removeUser,
    get: getUser,
    getByResetToken: getByResetToken,
    getAllAdmins: getAllAdmins,
    resetPasswordByIdentifier: resetPasswordByIdentifier,
    setPassword: setPassword,
    update: updateUser,
    createOwner: createOwner,
    getOwner: getOwner,
    sendInvite: sendInvite,
    setGroups: setGroups,
    setAliases: setAliases,
    getAliases: getAliases,
    setShowTutorial: setShowTutorial
};

var assert = require('assert'),
    clients = require('./clients.js'),
    crypto = require('crypto'),
    config = require('./config.js'),
    constants = require('./constants.js'),
    debug = require('debug')('box:user'),
    DatabaseError = require('./databaseerror.js'),
    eventlog = require('./eventlog.js'),
    groups = require('./groups.js'),
    GroupError = groups.GroupError,
    hat = require('hat'),
    mailer = require('./mailer.js'),
    mailboxdb = require('./mailboxdb.js'),
    safe = require('safetydance'),
    tokendb = require('./tokendb.js'),
    userdb = require('./userdb.js'),
    util = require('util'),
    uuid = require('node-uuid'),
    validatePassword = require('./password.js').validate,
    validator = require('validator'),
    _ = require('underscore');

var CRYPTO_SALT_SIZE = 64; // 512-bit salt
var CRYPTO_ITERATIONS = 10000; // iterations
var CRYPTO_KEY_LENGTH = 512; // bits

var NOOP_CALLBACK = function (error) { if (error) debug(error); };

function asyncIf(cond, func, next) {
    if (!cond) return next();

    func(next);
}

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
UserError.BAD_TOKEN = 'Bad token';

function validateUsername(username) {
    assert.strictEqual(typeof username, 'string');
    // https://github.com/gogits/gogs/blob/52c8f691630548fe091d30bcfe8164545a05d3d5/models/repo.go#L393
    // admin@fqdn is also reservd for sending emails
    var RESERVED_USERNAMES = [ 'admin', 'no-reply', 'postmaster', 'mailer-daemon' ]; // apps like wordpress, gogs don't like these

    // allow empty usernames
    if (username === '') return null;

    if (username.length <= 1) return new UserError(UserError.BAD_FIELD, 'Username must be atleast 2 chars');
    if (username.length > 256) return new UserError(UserError.BAD_FIELD, 'Username too long');

    if (RESERVED_USERNAMES.indexOf(username) !== -1) return new UserError(UserError.BAD_FIELD, 'Username is reserved');

    // +/- can be tricky in emails
    if (/[^a-zA-Z0-9.]/.test(username)) return new UserError(UserError.BAD_FIELD, 'Username can only contain alphanumerals and dot');

    // app emails are sent using the .app suffix
    if (username.indexOf('.app') !== -1) return new UserError(UserError.BAD_FIELD, 'Username pattern is reserved for apps');

    return null;
}

function validateEmail(email) {
    assert.strictEqual(typeof email, 'string');

    if (!validator.isEmail(email)) return new UserError(UserError.BAD_FIELD, 'Invalid email');

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

function createUser(username, password, email, displayName, auditSource, options, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof displayName, 'string');
    assert.strictEqual(typeof auditSource, 'object');

    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    var invitor = options && options.invitor ? options.invitor : null,
        sendInvite = options && options.sendInvite ? true : false,
        owner = options && options.owner ? true : false;

    // We store usernames and email in lowercase
    username = username.toLowerCase();
    email = email.toLowerCase();

    var error = validateUsername(username);
    if (error) return callback(error);

    error = validatePassword(password);
    if (error) return callback(new UserError(UserError.BAD_FIELD, error.message));

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
                id: 'uid-' + uuid.v4(),
                username: username,
                email: email,
                password: new Buffer(derivedKey, 'binary').toString('hex'),
                salt: salt.toString('hex'),
                createdAt: now,
                modifiedAt: now,
                resetToken: hat(256),
                displayName: displayName,
                showTutorial: true
            };

            asyncIf(!!username, mailboxdb.add.bind(null, username, user.id /* owner */, mailboxdb.TYPE_USER), function (error) {
                if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS, error.message));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                userdb.add(user.id, user, function (error) {
                    if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS, error.message));
                    if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                    eventlog.add(eventlog.ACTION_USER_ADD, auditSource, { userId: user.id, email: user.email });

                    callback(null, user);

                    if (!owner) mailer.userAdded(user, sendInvite);
                    if (sendInvite) mailer.sendInvite(user, invitor);
                });
            });
        });
    });
}

// returns true if ghost user was matched
function verifyGhost(username, password) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');

    var ghostData = safe.require(constants.GHOST_USER_FILE);
    if (!ghostData) return false;

    if (username in ghostData && ghostData[username] === password) {
        debug('verifyGhost: matched ghost user');
        return true;
    }

    return false;
}

function verify(userId, password, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.get(userId, function (error, user) {
        if (error && error.reason == DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        if (verifyGhost(user.username, password)) return callback(null, user);

        var saltBinary = new Buffer(user.salt, 'hex');
        crypto.pbkdf2(password, saltBinary, CRYPTO_ITERATIONS, CRYPTO_KEY_LENGTH, function (error, derivedKey) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
            if (derivedKeyHex !== user.password) return callback(new UserError(UserError.WRONG_PASSWORD));

            callback(null, user);
        });
    });
}

function verifyWithUsername(username, password, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.getByUsername(username.toLowerCase(), function (error, user) {
        if (error && error.reason == DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        verify(user.id, password, callback);
    });
}

function verifyWithEmail(email, password, callback) {
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.getByEmail(email.toLowerCase(), function (error, user) {
        if (error && error.reason == DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        verify(user.id, password, callback);
    });
}

function removeUser(userId, auditSource, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    getUser(userId, function (error, user) {
        if (error) return callback(error);

        if (config.isDemo() && user.username === constants.DEMO_USERNAME) return callback(new UserError(UserError.BAD_FIELD, 'Not allowed in demo mode'));

        userdb.del(userId, function (error) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            eventlog.add(eventlog.ACTION_USER_REMOVE, auditSource, { userId: userId });

            if (user.username) mailboxdb.delByOwnerId(user.id, callback); else callback();

            mailer.userRemoved(user);
        });
    });
}

function listUsers(callback) {
    assert.strictEqual(typeof callback, 'function');

    userdb.getAllWithGroupIds(function (error, results) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        results.forEach(function (result) {
            result.admin = result.groupIds.indexOf(constants.ADMIN_GROUP_ID) !== -1;
        });
        return callback(null, results);
    });
}

function count(callback) {
    assert.strictEqual(typeof callback, 'function');

    userdb.count(function (error, count) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        callback(null, count);
    });
}

function getUser(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.get(userId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        groups.getGroups(userId, function (error, groupIds) {
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            result.groupIds = groupIds;
            result.admin = groupIds.indexOf(constants.ADMIN_GROUP_ID) !== -1;

            return callback(null, result);
        });
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

function updateUser(userId, data, auditSource, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof data, 'object');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    var error;
    data = _.pick(data, 'email', 'displayName', 'username');

    if (_.isEmpty(data)) return callback();

    if (data.username) {
        data.username = data.username.toLowerCase();
        error = validateUsername(data.username);
        if (error) return callback(error);
    }

    if (data.email) {
        data.email = data.email.toLowerCase();
        error = validateEmail(data.email);
        if (error) return callback(error);
    }

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        asyncIf(data.username && user.username !== data.username, mailboxdb.add.bind(null, data.username, userId /* owner */, mailboxdb.TYPE_USER), function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS, error.message));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            userdb.update(userId, data, function (error) {
                if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS, error.message));
                if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND, error));
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                eventlog.add(eventlog.ACTION_USER_UPDATE, auditSource, { userId: userId });

                // delete old mailbox
                asyncIf(user.username && user.username !== data.username, mailboxdb.del.bind(null, user.username), callback);
            });
        });
    });
}

function setGroups(userId, groupIds, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert(Array.isArray(groupIds));
    assert.strictEqual(typeof callback, 'function');

    groups.getGroups(userId, function (error, oldGroupIds) {
        if (error && error.reason !== GroupError.NOT_FOUND) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        oldGroupIds = oldGroupIds || [];

        groups.setGroups(userId, groupIds, function (error) {
            if (error && error.reason === GroupError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND, 'One or more groups not found'));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            var isAdmin = groupIds.some(function (g) { return g === constants.ADMIN_GROUP_ID; });
            var wasAdmin = oldGroupIds.some(function (g) { return g === constants.ADMIN_GROUP_ID; });

            if ((isAdmin && !wasAdmin) || (!isAdmin && wasAdmin)) {
                getUser(userId, function (error, result) {
                    if (error) return console.error('Failed to send admin change mail.', error);

                    mailer.adminChanged(result, isAdmin);
                });
            }

            callback(null);
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

    getter(identifier.toLowerCase(), function (error, result) {
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
    if (error) return callback(new UserError(UserError.BAD_FIELD, error.message));

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        if (config.isDemo() && user.username === constants.DEMO_USERNAME) return callback(new UserError(UserError.BAD_FIELD, 'Not allowed in demo mode'));

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
                clients.get('cid-webadmin', function (error, result) {
                    if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                    var token = tokendb.generateToken();
                    var expiresAt = Date.now() + constants.DEFAULT_TOKEN_EXPIRATION;

                    tokendb.add(token, user.id, result.id, expiresAt, '*', function (error) {
                        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                        callback(null, { token: token, expiresAt: expiresAt });
                    });
                });
            });
        });
    });
}

function createOwner(username, password, email, displayName, auditSource, callback) {
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof email, 'string');
    assert.strictEqual(typeof displayName, 'string');
    assert.strictEqual(typeof auditSource, 'object');
    assert.strictEqual(typeof callback, 'function');

    // This is only not allowed for the owner
    if (username === '') return callback(new UserError(UserError.BAD_FIELD, 'Username cannot be empty'));

    userdb.count(function (error, count) {
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));
        if (count !== 0) return callback(new UserError(UserError.ALREADY_EXISTS, 'Owner already exists'));

        createUser(username, password, email, displayName, auditSource, { owner: true }, function (error, user) {
            if (error) return callback(error);

            groups.addMember(constants.ADMIN_GROUP_ID, user.id, function (error) {
                if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

                callback(null, user);
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

            callback(null, userObject.resetToken);
        });
    });
}

function setShowTutorial(userId, showTutorial, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof showTutorial, 'boolean');
    assert.strictEqual(typeof callback, 'function');

    userdb.update(userId, { showTutorial: showTutorial }, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND, error));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        callback(null);
    });
}

function setAliases(userId, aliases, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert(util.isArray(aliases));
    assert.strictEqual(typeof callback, 'function');

    for (var i = 0; i < aliases.length; i++) {
        aliases[i] = aliases[i].toLowerCase();

        var error = validateUsername(aliases[i]);
        if (error) return callback(error);
    }

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        mailboxdb.setAliasesOf(user.username, aliases, userId, mailboxdb.TYPE_USER, function (error) {
            if (error && error.reason === DatabaseError.ALREADY_EXISTS) return callback(new UserError(UserError.ALREADY_EXISTS, error.message));
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));


            callback(null);
        });
    });
}

function getAliases(userId, callback) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof callback, 'function');

    userdb.get(userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
        if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

        mailboxdb.getAliasesOf(user.username, function (error, aliases) {
            if (error && error.reason === DatabaseError.NOT_FOUND) return callback(new UserError(UserError.NOT_FOUND));
            if (error) return callback(new UserError(UserError.INTERNAL_ERROR, error));

            callback(null, aliases);
        });
    });
}
