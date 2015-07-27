/* jslint node:true */

'use strict';

exports = module.exports = {
    enabled: enabled,
    setEnabled: setEnabled,
    status: status,
    login: login,
    apps: apps
};

var developer = require('../developer.js'),
    passport = require('passport'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function enabled(req, res, next) {
    developer.enabled(function (error, enabled) {
        if (enabled) return next();
        next(new HttpError(412, 'Developer mode not enabled'));
    });
}

function setEnabled(req, res, next) {
    if (typeof req.body.enabled !== 'boolean') return next(new HttpError(400, 'enabled must be boolean'));

    developer.setEnabled(req.body.enabled, function (error) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, {}));
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

function apps(req, res, next) {
    developer.getNonApprovedApps(function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { apps: result }));
    });
}