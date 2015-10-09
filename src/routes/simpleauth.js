/* jslint node:true */

'use strict';

exports = module.exports = {
    login: login,
    logout: logout
};

var assert = require('assert'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    DatabaseError = require('../databaseerror.js'),
    UserError = require('../user.js').UserError,
    simpleauth = require('../simpleauth.js');

function login(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.clientId !== 'string') return next(new HttpError(400, 'clientId is required'));
    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username is required'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password is required'));

    simpleauth.login(req.body.clientId, req.body.username, req.body.password, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(401, 'Unknown client'));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(401, 'Forbidden'));
        if (error && error.reason === UserError.WRONG_PASSWORD) return next(new HttpError(401, 'Forbidden'));
        if (error) return next(new HttpError(500, error));

        var tmp = {
            accessToken: result.accessToken,
            user: {
                id: result.user.id,
                username: result.user.username,
                email: result.user.email,
                admin: !!result.user.admin
            }
        };

        next(new HttpSuccess(201, tmp));
    });
}

function logout(req, res, next) {
    simpleauth.logout(function (error) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, {}));
    });
}
