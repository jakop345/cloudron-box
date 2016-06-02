'use strict';

exports = module.exports = {
    get: get,
    update: update,
    changePassword: changePassword,
    setShowTutorial: setShowTutorial
};

var assert = require('assert'),
    groups = require('../groups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    user = require('../user.js'),
    UserError = user.UserError;

function auditSource(req) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || null;
    return { ip: ip, username: req.user ? req.user.username : null, userId: req.user ? req.user.id : null };
}

function get(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    groups.isMember(groups.ADMIN_GROUP_ID, req.user.id, function (error, isAdmin) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            admin: isAdmin,
            displayName: req.user.displayName,
            showTutorial: req.user.showTutorial
        }));
    });
}

function update(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.body, 'object');

    if ('email' in req.body && typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));
    if ('displayName' in req.body && typeof req.body.displayName !== 'string') return next(new HttpError(400, 'displayName must be string'));

    user.update(req.user.id, req.user.username, req.body.email || req.user.email, req.body.displayName || req.user.displayName, auditSource(req), function (error) {
        if (error && error.reason === UserError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.ALREADY_EXISTS) return next(new HttpError(409, error.message));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(404, 'User not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function changePassword(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');
    assert.strictEqual(typeof req.user, 'object');

    if (typeof req.body.newPassword !== 'string') return next(new HttpError(400, 'newPassword must be a string'));

    user.setPassword(req.user.id, req.body.newPassword, function (error) {
        if (error && error.reason === UserError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(403, 'Wrong password'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function setShowTutorial(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.showTutorial !== 'boolean') return next(new HttpError(400, 'showTutorial must be a boolean.'));

    user.setShowTutorial(req.user.id, req.body.showTutorial, function (error) {
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(403, 'Wrong password'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}
