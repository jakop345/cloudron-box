/* jslint node:true */

'use strict';

var assert = require('assert'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    user = require('../user.js'),
    tokendb = require('../tokendb.js'),
    UserError = user.UserError;

exports = module.exports = {
    profile: profile,
    info: info,
    update: update,
    list: listUser,
    create: createUser,
    changePassword: changePassword,
    changeAdmin: changeAdmin,
    remove: removeUser,
    verifyPassword: verifyPassword,
    requireAdmin: requireAdmin
};

// http://stackoverflow.com/questions/1497481/javascript-password-generator#1497512
function generatePassword() {
    var length = 8,
        charset = 'abcdefghijklnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        retVal = '';
    for (var i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

function profile(req, res, next) {
    assert(typeof req.user === 'object');

    var result = {};
    result.id = req.user.id;
    result.tokenType = req.user.tokenType;

    if (req.user.tokenType === tokendb.TYPE_USER || req.user.tokenType === tokendb.TYPE_DEV) {
        result.username = req.user.username;
        result.email = req.user.email;
        result.admin = req.user.admin;
    }

    next(new HttpSuccess(200, result));
}

/**
 * @api {post} /api/v1/user/create create
 * @apiName create
 * @apiGroup user
 * @apiPermission admin
 * @apiDescription
 * Only the administrator is allowed to create a new user.
 * A normal user can create its own volumes and is able to share those with other users.
 *
 * @apiParam {string} username The new user's login name
 * @apiParam {string} email The new users's email address
 *
 * @apiSuccess (Created 201) none User successfully created
 * @apiError (Bad request 400) {Number} status Http status code
 * @apiError (Bad request 400) {String} message Error details
 * @apiError (User already exists 409) {Number} status Http status code
 * @apiError (User already exists 409) {String} message Error details
 */
function createUser(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username must be string'));
    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));

    var username = req.body.username;
    var password = generatePassword();
    var email = req.body.email;

    user.create(username, password, email, false /* admin */, function (error, user) {
        if (error && error.reason === UserError.BAD_USERNAME) return next(new HttpError(400, 'Invalid username'));
        if (error && error.reason === UserError.BAD_EMAIL) return next(new HttpError(400, 'Invalid email'));
        if (error && error.reason === UserError.BAD_PASSWORD) return next(new HttpError(400, 'Invalid password'));
        if (error && error.reason === UserError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error) return next(new HttpError(500, error));

        var userInfo = {
            id: user.id,
            username: user.username,
            email: user.email,
            admin: user.admin
        };

        next(new HttpSuccess(201, { userInfo: userInfo }));
    });
}

function update(req, res, next) {
    assert(typeof req.user === 'object');
    assert(typeof req.body === 'object');

    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));

    if (req.user.tokenType !== tokendb.TYPE_USER) return next(new HttpError(403, 'Token type not allowed'));

    user.update(req.user.id, req.user.username, req.body.email, function (error) {
        if (error && error.reason === UserError.BAD_EMAIL) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(404, 'User not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function changeAdmin(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'API call requires a username.'));
    if (typeof req.body.admin !== 'boolean') return next(new HttpError(400, 'API call requires an admin setting.'));

    user.changeAdmin(req.body.username, req.body.admin, function (error) {
        if (error && error.reason === UserError.NOT_ALLOWED) return next(new HttpError(403, 'Last admin'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function changePassword(req, res, next) {
    assert(typeof req.body === 'object');
    assert(typeof req.user === 'object');

    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'API call requires the users old password.'));
    if (typeof req.body.newPassword !== 'string') return next(new HttpError(400, 'API call requires the users new password.'));

    if (req.user.tokenType !== tokendb.TYPE_USER) return next(new HttpError(403, 'Token type not allowed'));

    user.changePassword(req.user.username, req.body.password, req.body.newPassword, function (error) {
        if (error && error.reason === UserError.BAD_PASSWORD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.WRONG_PASSWORD) return next(new HttpError(403, 'Wrong password'));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(403, 'Wrong password'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function listUser(req, res, next) {
    user.list(function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { users: result }));
    });
}

/**
 * @api {get} /api/v1/user/info info
 * @apiName info
 * @apiGroup user
 * @apiDescription
 * Get user information.
 *
 * @apiSuccess {String} username Username
 * @apiSuccess {String} email User's email address
 */
function info(req, res, next) {
    assert(typeof req.params.userId === 'string');

    user.get(req.params.userId, function (error, result) {
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(404, 'No such user'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, {
            id: result.id,
            username: result.username,
            email: result.email,
            admin: result.admin
        }));
    });
}

/**
 * @api {post} /api/v1/user/remove remove
 * @apiName remove
 * @apiGroup user
 * @apiDescription
 * The administrator can remove any user and each user can only remove himself.
 *
 * @apiParam {string} username The username of the user to be removed
 *
 * @apiSuccess none User successfully removed
 * @apiError (Forbidden 403) {Number} status Http status code
 * @apiError (Forbidden 403) {String} message Error details
 */
function removeUser(req, res, next) {
    assert(typeof req.params.userId === 'string');

    // rules:
    // - admin can remove any user
    // - admin cannot remove admin
    // - user cannot remove himself <- TODO should this actually work?

    if (req.user.id === req.params.userId) return next(new HttpError(403, 'Not allowed to remove yourself.'));

    user.remove(req.params.userId, function (error) {
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(404, 'User not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function verifyPassword(req, res, next) {
    assert(typeof req.body === 'object');

    // developers are allowed to through without password
    if (req.user.tokenType === tokendb.TYPE_DEV) return next();

    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'API call requires user password'));

    user.verify(req.user.username, req.body.password, function (error) {
        if (error && error.reason === UserError.WRONG_PASSWORD) return next(new HttpError(403, 'Password incorrect'));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(403, 'Password incorrect'));
        if (error) return next(new HttpError(500, error));

        next();
    });
}

/*
    Middleware which makes the route only accessable for the admin user.
*/
function requireAdmin(req, res, next) {
    assert(typeof req.user === 'object');

    if (!req.user.admin) return next(new HttpError(403, 'API call requires the admin rights.'));

    next();
}

