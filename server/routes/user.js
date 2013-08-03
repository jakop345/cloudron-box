'use strict';

var db = require('../database'),
    DatabaseError = db.DatabaseError,
    crypto = require('crypto'),
    debug = require('debug')('user.js'),
    HttpError = require('../httperror'),
    express = require('express');

exports = module.exports = {
    firstTime: firstTime,
    createAdmin: createAdmin,
    authenticate: authenticate,
    createToken: createToken
};

function firstTime(req, res, next) {
    if (req.method !== 'GET') return next(new HttpError(405, 'Only GET allowed'));
    res.send({ firstTime: db.firstTime() });
}

function createAdmin(req, res, next) {
    // TODO: check that no other admin user exists
    if (req.method !== 'POST') return next(new HttpError(405, 'Only POST allowed'));

    var username = req.body.username || '';
    var email = req.body.email || '';
    var password = req.body.password || '';

    if (username.length === 0 || password.length === 0 || email.length == 0) {
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

function authenticate(req, res, next) {
    function basicAuthenticator(username, password, next) {
        if (username.length === 0 || password.length === 0) {
            return next(new HttpError(400, 'Bad username or password'));
        }

        db.USERS_TABLE.get(username, function (err, user) {
            if (err) {
                return next(err.reason === DatabaseError.NOT_FOUND
                    ? new HttpError(401, 'Username and password does not match')
                    : err);
            }

            var saltBinary = new Buffer(user.salt, 'hex');
            crypto.pbkdf2(password, saltBinary, 10000 /* iterations */, 512 /* bits */, function (err, derivedKey) {
                if (err) return next(new HttpError(500, 'Failed to hash password'));

                var derivedKeyHex = new Buffer(derivedKey, 'binary').toString('hex');
                if (derivedKeyHex != user.password) return next(new HttpError(401, 'Username and password does not match'));

                delete user.salt;
                delete user.password;
                user.basicAuthenticator = true;
                next(null, user); // saved as req.user
            });
        });
    }

    function tokenAuthenticator(req, res, next) {
        if (req.query.auth_token.length != 64 * 2) {
            return next(new HttpError(401, 'Bad token'));
        }

        db.TOKENS_TABLE.get(req.query.auth_token, function (err, token) {
            if (err) {
                return next(err.reason === DatabaseError.NOT_FOUND
                    ? new HttpError(401, 'Invalid token')
                    : err);
            }

            var now = Date(), expires = Date(token.expires);

            if (now > expires) return next(new HttpError(401, 'Token expired'));

            req.user = { username: token.username, tokenAuthenticator: true };
            next();
        });
    }

    if (req.headers.authorization) {
        debug('using basic authentication');
        express.basicAuth(basicAuthenticator)(req, res, next);
    } else if (req.query.auth_token) {
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
            expires: expires
        };

        db.TOKENS_TABLE.put(token, function (err) {
            if (err) return next(err);
            res.send(200, JSON.stringify(db.TOKENS_TABLE.removePrivates(token)));
        });
    });
}

