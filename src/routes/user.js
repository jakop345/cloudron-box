'use strict';

var db = require('../database'),
    DatabaseError = db.DatabaseError,
    crypto = require('crypto'),
    debug = require('debug')('user.js'),
    HttpError = require('../httperror'),
    express = require('express');

exports = module.exports = {
    firstTimeCheck: firstTimeCheck,
    createAdmin: createAdmin,
    authenticate: authenticate,
    createToken: createToken,
    logout: logout,
    userInfo: userInfo
};

function firstTimeCheck(req, res, next) {
    if (req.method !== 'GET') return next();
    // TODO: poor man's check if its an html page ;-)
    if (req.url.indexOf('html') < 0 && req.url !== '/') return next();

    // if its not not first time but firsttime.html is requested, redirect to index.html
    if (!db.firstTime()) {
        if (req.url === "/firsttime.html") return res.redirect("index.html");
        return next();
    }

    if (req.url === "/firsttime.html") return next();

    res.redirect("firsttime.html");
}

function createAdmin(req, res, next) {
    // TODO: check that no other admin user exists
    if (req.method !== 'POST') return next(new HttpError(405, 'Only POST allowed'));

    var username = req.body.username || '';
    var email = req.body.email || '';
    var password = req.body.password || '';

    if (username.length === 0 || password.length === 0 || email.length === 0) {
        return next(new HttpError(400, 'Bad username, password or email'));
    }

    crypto.randomBytes(64 /* 512-bit salt */, function (err, salt) {
        if (err) return next(new HttpError(500, 'Failed to generate random bytes'));

        crypto.pbkdf2(password, salt, 10000 /* iterations */, 512 /* bits */, function (err, derivedKey) {
            if (err) return next(new HttpError(500, 'Failed to hash password'));

            var now = (new Date()).toUTCString();
            var user = {
                username: username,
                email: email,
                password: new Buffer(derivedKey, 'binary').toString('hex'),
                salt: salt.toString('hex'),
                created_at: now,
                updated_at: now
            };
            db.USERS_TABLE.put(user, function (err) {
                if (err) {
                    if (err.reason === DatabaseError.ALREADY_EXISTS) {
                        return next(new HttpError(404, 'Already exists'));
                    }
                    return next(err);
                }

                res.send(202);
            });
        });
    });
}

function extractCredentialsFromHeaders (req) {
    if (!req.headers || ! req.headers.authorization) {
        debug("No authorization header.");
        return null;
    }

    var b = new Buffer(req.headers.authorization, 'base64');
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
            return next(new HttpError(400, 'Bad username or password'), false);
        }

        db.USERS_TABLE.get(auth.username, function (err, user) {
            if (err) {
                return next(err.reason === DatabaseError.NOT_FOUND
                    ? new HttpError(401, 'Username and password does not match')
                    : err, false);
            }

            var saltBinary = new Buffer(user.salt, 'hex');
            crypto.pbkdf2(auth.password, saltBinary, 10000 /* iterations */, 512 /* bits */, function (err, derivedKey) {
                if (err) {
                    return next(new HttpError(500, 'Failed to hash password'), false);
                }

                var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
                if (derivedKeyHex != user.password)  {
                    return next(new HttpError(401, 'Username and password does not match'), false);
                }

                debug('authenticated');

                req.user = {
                    username: user.username,
                    email: user.email
                };

                next();
            });
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

            next();
        });
    }

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
            res.send(200, JSON.stringify(db.TOKENS_TABLE.removePrivates(token)));
        });
    });
}

function userInfo(req, res, next) {
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
