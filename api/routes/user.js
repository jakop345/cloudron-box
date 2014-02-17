'use strict';

var db = require('../database'),
    DatabaseError = db.DatabaseError,
    user = require('../user'),
    Volume = require('../volume'),
    VolumeError = Volume.VolumeError,
    UserError = user.UserError,
    crypto = require('crypto'),
    async = require('async'),
    debug = require('debug')('server:routes/user'),
    HttpError = require('../httperror'),
    HttpSuccess = require('../httpsuccess');

exports = module.exports = {
    initialize: initialize,
    createAdmin: createAdmin,
    authenticate: authenticate,
    createToken: createToken,
    logout: logout,
    info: info,
    list: listUser,
    create: createUser,
    changePassword: changePassword,
    remove: removeUser
};

var config;

function initialize(cfg) {
    config = cfg;
}

/**
* @apiDefinePermission admin Admin access rights needed.
* This can only be called in the context of the box owner/administrator
*/

/**
 * @api {post} /api/v1/createadmin createAdmin
 * @apiName createAdmin
 * @apiGroup generic
 * @apiDescription
 * This method can only be called when the device is in first time activation mode.
 * Currently there is only one admin user allowed per device.
 * Creating an admin user also puts the device out of first time activation mode.
 *
 * @apiParam {string} username The administrator's user name
 * @apiParam {string} password The administrator's password
 * @apiParam {string} email The administrator's email address
 *
 * @apiSuccess (Created 201) {string} token A valid access token
 * @apiError 403 Admin user already exists. There can only be one per box at all time.
 */
function createAdmin(req, res, next) {
    if (req.method !== 'POST') {
        return next(new HttpError(405, 'Only POST allowed'));
    }

    if (db.USERS_TABLE.count() > 0) {
        return next(new HttpError(403, 'Only one admin allowed'));
    }

    var username = req.body.username || '';
    var password = req.body.password || '';
    var email = req.body.email || '';

    user.create(username, password, email, {}, function (error, result) {
        if (error) {
            if (error.reason === UserError.ARGUMENTS) {
                return next(new HttpError(400, error.message));
            } else if (error.reason === UserError.ALREADY_EXISTS) {
                return next(new HttpError(409, 'Already exists'));
            } else {
                return next(new HttpError(500, error.message));
            }
        }

        // TODO no next(), as we do not want to fall through to authentication
        // the whole createAdmin should be handled differently
        res.send(201, {});
    });
}

/**
 * @api {post} /api/v1/user/create create
 * @apiName create
 * @apiGroup user
 * @apiPermission admin
 * @apiDescription
 * Only the administrator is allowed to create a new user.
 * A normal user can create its own volumes and is able to share those with other users.
 *
 * @apiParam {string} username The new user's login name
 * @apiParam {string} password The new users's password
 * @apiParam {string} email The new users's email address
 *
 * @apiSuccess (Created 201) none User successfully created
 * @apiError (Bad request 400) {Number} status Http status code
 * @apiError (Bad request 400) {String} message Error details
 * @apiError (User already exists 409) {Number} status Http status code
 * @apiError (User already exists 409) {String} message Error details
 */
function createUser(req, res, next) {
    var username = req.body.username || '';
    var password = req.body.password || '';
    var email = req.body.email || '';

    user.create(username, password, email, {}, function (error, result) {
        if (error) {
            if (error.reason === UserError.ARGUMENTS) {
                return next(new HttpError(400, error.message));
            } else if (error.reason === UserError.ALREADY_EXISTS) {
                return next(new HttpError(409, 'Already exists'));
            } else {
                return next(new HttpError(500, error.message));
            }
        }

        next(new HttpSuccess(201, {}));
    });
}

function changePassword(req, res, next) {
    if (!req.body.password) return next(new HttpError(400, 'API call requires the users old password.'));
    if (!req.body.newPassword) return next(new HttpError(400, 'API call requires the users new password.'));

    user.changePassword(req.user.username, req.body.password, req.body.newPassword, function (error, result) {
        if (error) {
            debug('Failed to change password for user', req.user.username);
            if (error.reason === UserError.WRONG_USER_OR_PASSWORD) {
                return next(new HttpError(403, 'Wrong password'));
            }
            return next(new HttpError(500, 'Unable to change password'));
        }

        next(new HttpSuccess(200, {}));
    });
}

function listUser(req, res, next) {
    user.list(function (error, result) {
        if (error) return next(new HttpError(500, error.message));
        next(new HttpSuccess(200, { users: result }));
    });
}

function extractCredentialsFromHeaders (req) {
    if (!req.headers || !req.headers.authorization) {
        debug('No authorization header.');
        return null;
    }

    if (req.headers.authorization.substr(0, 6) !== 'Basic ') {
        debug('Only basic authorization supported.');
        return null;
    }

    var b = new Buffer(req.headers.authorization.substr(6), 'base64');
    var s = b.toString('utf8');
    if (!s) {
        debug('Authorization header does not contain a valid string.');
        return null;
    }

    var a = s.split(':');
    if (a.length != 2) {
        debug('Authorization header does not contain a valid username:password tuple.');
        return null;
    }

    return {
        username: a[0],
        password: a[1]
    };
}

function loginAuthenticator(req, res, next) {
    var auth = extractCredentialsFromHeaders(req);

    if (!auth) {
        debug('Could not extract credentials.');
        return next(new HttpError(400, 'No credentials'), false);
    }

    user.verify(auth.username, auth.password, function (error, user) {
        if (error) {
            debug('User ' + auth.username  + ' could not be verified.');
            if (error.reason === UserError.ARGUMENTS) {
                return next(new HttpError(400, error.message));
            } else if (error.reason === UserError.NOT_FOUND) {
                return next(new HttpError(401, 'No such user'));
            } else if (error.reason === UserError.WRONG_USER_OR_PASSWORD) {
                return next(new HttpError(401, 'Username or password do not match'));
            } else {
                return next(new HttpError(500, error.message));
            }
        }

        debug('User ' + auth.username + ' was successfully verified.');

        req.user = user;
        next();
    });
}

function tokenAuthenticator(req, res, next) {
    var req_token = req.query.auth_token ? req.query.auth_token : req.cookies.token;

    if (req_token.length != 64 * 2) {
        debug('Received a token with invalid length', req_token.length, req_token);
        return next(new HttpError(401, 'Bad token'));
    }

    db.TOKENS_TABLE.get(req_token, function (err, result) {
        if (err) {
            debug('Received unknown token', req_token);
            return next(err.reason === DatabaseError.NOT_FOUND
                ? new HttpError(401, 'Invalid token')
                : err);
        }

        var now = Date(), expires = Date(result.expires);
        if (now > expires) return next(new HttpError(401, 'Token expired'));

        db.USERS_TABLE.get(result.username, function (error, user) {
            if (error) return next(new HttpError(500, ''));
            if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'User not found'));

            debug('User ' + user.username + ' was successfully verified.');

            req.user = user;
            next();
        });
    });
}

function authenticate(req, res, next) {
    if (req.headers.authorization) {
        debug('using login authentication');
        loginAuthenticator(req, res, next);
    } else if (req.query.auth_token || req.cookies.token) {
        debug('using token based authentication');
        tokenAuthenticator(req, res, next);
    } else {
        next(new HttpError(401, 'No credentials'));
    }
}

/**
 * @api {get} /api/v1/token token
 * @apiName token
 * @apiGroup user
 * @apiDescription
 * This route may be used to verify a user and retrieve an access token for further API access.
 * As any other route, the authentication is using the auth header.
 *
 * @apiSuccess {String} token Access token to be used for further API calls
 * @apiSuccess {Date} expires Expiration date for the access token
 * @apiSuccess {String} username Username associated with the access token
 * @apiSuccess {String} email Email associated with the access token
 */
function createToken(req, res, next) {
    crypto.randomBytes(64 /* 512-bit */, function (err, tok) {
        if (err) return next(new HttpError(500, 'Failed to generate random bytes'));
        var expires = new Date((new Date()).getTime() + 60 * 60000).toUTCString(); // 1 hour

        var hexToken = tok.toString('hex');

        var token = {
            token: hexToken,
            username: req.user.username,
            email: req.user.email,
            expires: expires
        };

        db.TOKENS_TABLE.put(token, function (err) {
            if (err) return next(err);
            next(new HttpSuccess(200, {
                token: hexToken,
                expires: expires,
                userInfo: {
                    username: req.user.username,
                    email: req.user.email,
                    admin: req.user.admin
                }
            }));
        });
    });
}

/**
 * @api {get} /api/v1/user/info info
 * @apiName info
 * @apiGroup user
 * @apiDescription
 * Get user information.
 *
 * @apiSuccess {String} username Username
 * @apiSuccess {String} email User's email address
 */
function info(req, res, next) {
    // req.user is filled by the authentication step
    next(new HttpSuccess(200, {
        username: req.user.username,
        email: req.user.email,
        admin: req.user.admin
    }));
}

/**
 * @api {get} /api/v1/logout logout
 * @apiName logout
 * @apiGroup user
 * @apiDescription
 * Invalidates all access tokens associated with this user.
 *
 * @apiSuccess none User successfully logged out
 */
function logout(req, res, next) {
    var req_token = req.query.auth_token ? req.query.auth_token : req.cookies.token;

    // Invalidate token so the cookie cannot be reused after logout
    db.TOKENS_TABLE.remove(req_token, function (error, result) {
        if (error) return next(error);
        next(new HttpSuccess(200, {}));
    });
}

/**
 * @api {post} /api/v1/user/remove remove
 * @apiName remove
 * @apiGroup user
 * @apiDescription
 * The administrator can remove any user and each user can only remove himself.
 *
 * @apiParam {string} username The username of the user to be removed
 *
 * @apiSuccess none User successfully removed
 * @apiError (Forbidden 403) {Number} status Http status code
 * @apiError (Forbidden 403) {String} message Error details
 */
function removeUser(req, res, next) {
    var username = req.body.username || '';

    // rules:
    // - admin can remove any user
    // - admin cannot remove admin

    // req.user is ensured to be the admin via requireAdmin middleware
    if (req.user.username === username) {
        return next(new HttpError(403, 'Not allowed to remove this user.'));
    }

    user.remove(username, function (error, result) {
        if (error) {
            if (error.reason === DatabaseError.NOT_FOUND) {
                return next(new HttpError(404, 'User not found'));
            }
            return next(new HttpError(500, 'Failed to remove user'));
        }
        next(new HttpSuccess(200, {}));
    });
}
