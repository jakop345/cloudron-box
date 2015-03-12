/* jslint node:true */

'use strict';

var developer = require('../developer.js'),
    passport = require('passport'),
    debug = require('debug')('box:routes/developer'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    login: login
};

function login(req, res, next) {
    passport.authenticate('local', function (error, user) {
        if (error) return next(new HttpError(500, error));
        if (!user) return next(new HttpError(401, 'Invalid credentials'));

        developer.issueDeveloperToken(user, function (error, result) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(200, { token: result.token, expiresAt: result.expiresAt }));
        });
  })(req, res, next);
}
