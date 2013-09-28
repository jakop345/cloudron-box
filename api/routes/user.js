'use strict';

var db = require('../database'),
    DatabaseError = db.DatabaseError,
    user = require('../user.js'),
    UserError = user.UserError,
    crypto = require('crypto'),
    debug = require('debug')('user.js'),
    HttpError = require('../httperror'),
    express = require('express');

exports = module.exports = {
    firstTime: firstTime,
    createAdmin: createAdmin,
    authenticate: authenticate,
    createToken: createToken,
    logout: logout,
    info: info,
    create: createUser,
    remove: removeUser
};

/*
 * Ask the device if it is in first time activation mode.
 *
 * The GET request will be answered with 200 in case the the device is in
 * first time activation mode, otherwise will return a 404.
 */
function firstTime(req, res, next) {
    if (req.method !== 'GET') {
        return next(new HttpError(405, 'Only GET allowed'));
    }

    if (!db.firstTime()) {
        return next(new HttpError(404, 'Box is already setup.'));
    }

    return res.send(200);
}

function createAdmin(req, res, next) {
    if (req.method !== 'POST') {
        return next(new HttpError(405, 'Only POST allowed'));
    }

    if (db.USERS_TABLE.count() > 0) {
        return next(new HttpError(404, 'Only one admin allowed'));
    }

    createUser(req, res, next);
}

function createUser(req, res, next) {
    // TODO: I guess only the admin should be allowed to do so? - Johannes
    var username = req.body.username || '';
    var password = req.body.password || '';
    var email = req.body.email || '';

    user.create(username, password, email, {}, function (error, result) {
        if (error) {
            if (error.reason === UserError.ARGUMENTS) {
                return next(new HttpError(400, error.message));
            } else if (error.reason === UserError.ALREADY_EXISTS) {
                return next(new HttpError(404, 'Already exists'));
            } else {
                return next(new HttpError(500, error.message));
            }
        }

        res.send(202);
    });
}

function extractCredentialsFromHeaders (req) {
    if (!req.headers || !req.headers.authorization) {
        debug("No authorization header.");
        return null;
    }

    if (req.headers.authorization.substr(0, 6) !== 'Basic ') {
        debug("Only basic authorization supported.");
        return null;
    }

    var b = new Buffer(req.headers.authorization.substr(6), 'base64');
    var s = b.toString('utf8');
    if (!s) {
        debug("Authorization header does not contain a valid string.");
        return null;
    }

    var a = s.split(':');
    if (a.length != 2) {
        debug("Authorization header does not contain a valid username:password tuple.");
        return null;
    }

    return {
        username: a[0],
        password: a[1]
    };
}

function authenticate(req, res, next) {
    function loginAuthenticator(req, res, next) {
        var auth = extractCredentialsFromHeaders(req);

        if (!auth) {
            debug('Could not extract credentials.');
            return next(new HttpError(400, 'Bad username or password'), false);
        }

        user.verify(auth.username, auth.password, function (error, result) {
            if (error) {
                debug('User ' + auth.username  + ' could not be verified.');
                if (error.reason === UserError.ARGUMENTS) {
                    return next(new HttpError(400, error.message));
                } else if (error.reason === UserError.NOT_FOUND || error.reason === UserError.WRONG_USER_OR_PASSWORD) {
                    return next(new HttpError(401, 'Username or password do not match'));
                } else {
                    return next(new HttpError(500, error.message));
                }
            }

            debug('User ' + auth.username + ' was successfully verified.');

            req.user = result;
            req.user.password = auth.password;

            next();
        });
    }

    function tokenAuthenticator(req, res, next) {
        var req_token = req.query.auth_token ? req.query.auth_token : req.cookies.token;

        if (req_token.length != 64 * 2) {
            return next(new HttpError(401, 'Bad token'));
        }

        db.TOKENS_TABLE.get(req_token, function (err, result) {
            if (err) {
                return next(err.reason === DatabaseError.NOT_FOUND
                    ? new HttpError(401, 'Invalid token')
                    : err);
            }

            var now = Date(), expires = Date(result.expires);
            if (now > expires) return next(new HttpError(401, 'Token expired'));

            req.user = {
                username: result.username,
                email: result.email
            };

            // attach the password in case it was sent via auth headers
            var auth = extractCredentialsFromHeaders(req);
            if (auth && auth.username === result.username) {
                req.user.password = auth.password;
            }

            next();
        });
    }

    if (req.query.auth_token || req.cookies.token) {
        debug('using token based authentication');
        tokenAuthenticator(req, res, next);
    } else if (req.headers.authorization) {
        debug('using login authentication');
        loginAuthenticator(req, res, next);
    } else {
        next(new HttpError(401, 'No credentials'));
    }
}

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
            res.send(200, db.TOKENS_TABLE.removePrivates(token));
        });
    });
}

function info(req, res, next) {
    // req.user is filled by the authentication step
    res.send(req.user);
}

function logout(req, res, next) {
    var req_token = req.query.auth_token ? req.query.auth_token : req.cookies.token;

    // Invalidate token so the cookie cannot be reused after logout
    db.TOKENS_TABLE.remove(req_token, function (error, result) {
        if (error) {
            return next(error.reason === DatabaseError.NOT_FOUND ? new HttpError(401, 'Invalid token') : error);
        }

        res.send(200);
    });
}

function removeUser(req, res, next) {
    var username = req.body.username || '';

    // rules:
    // - admin can remove any user
    // - user can only remove himself
    // - TODO should the admin user be able to remove himself? - Johannes
    if (req.user.admin || req.user.username === username) {
        user.remove(username, function (error, result) {
            if (error) {
                return next(new HttpError(500, error.message));
            }

            return res.send(200);
        });

        return;
    }

    return next(new HttpError(400, 'Not allowed to remove this user.'));
}
