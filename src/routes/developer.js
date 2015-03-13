/* jslint node:true */

'use strict';

var developer = require('../developer.js'),
    passport = require('passport'),
    debug = require('debug')('box:routes/developer'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    enabled: enabled,
    status: status,
    login: login
};

function enabled(req, res, next) {
    developer.enabled(function (error, enabled) {
        if (enabled) return next();
        next(new HttpError(412, 'Developer mode not enabled'));
    });
}

function status(req, res, next) {
    next(new HttpSuccess(200, {}));
}

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
