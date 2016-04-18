/* jslint node:true */

'use strict';

exports = module.exports = {
    get: get,
    update: update,
    changePassword: changePassword
};

var assert = require('assert'),
    groups = require('../groups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    user = require('../user.js'),
    tokendb = require('../tokendb.js'),
    UserError = user.UserError;

function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    var result = {};
    result.id = req.user.id;
    result.tokenType = req.user.tokenType;

    if (req.user.tokenType === tokendb.TYPE_USER || req.user.tokenType === tokendb.TYPE_DEV) {
        result.username = req.user.username;
        result.email = req.user.email;
        result.displayName = req.user.displayName;

        groups.isMember(groups.ADMIN_GROUP_ID, req.user.id, function (error, isAdmin) {
            if (error) return next(new HttpError(500, error));

            result.admin = isAdmin;

            next(new HttpSuccess(200, result));
        });
    } else {
        next(new HttpSuccess(200, result));
    }
}

function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.body, 'object');

    if ('email' in req.body && typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));
    if ('displayName' in req.body && typeof req.body.displayName !== 'string') return next(new HttpError(400, 'displayName must be string'));

    if (req.user.tokenType !== tokendb.TYPE_USER) return next(new HttpError(403, 'Token type not allowed'));

    user.update(req.user.id, req.user.username, req.body.email || req.user.email, req.body.displayName || req.user.displayName, function (error) {
        if (error && error.reason === UserError.BAD_USERNAME) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.BAD_EMAIL) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(404, 'User not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function changePassword(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');
    assert.strictEqual(typeof req.user, 'object');

    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'API call requires the users old password.'));
    if (typeof req.body.newPassword !== 'string') return next(new HttpError(400, 'API call requires the users new password.'));

    if (req.user.tokenType !== tokendb.TYPE_USER) return next(new HttpError(403, 'Token type not allowed'));

    user.setPassword(req.user.id, req.body.newPassword, function (error) {
        if (error && error.reason === UserError.BAD_PASSWORD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(403, 'Wrong password'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}
