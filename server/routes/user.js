'use strict';

var db = require('../database'),
    crypto = require('crypto');

exports = module.exports = {
    firstTime: firstTime,
    createAdmin: createAdmin
};

function firstTime(req, res, next) {
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

