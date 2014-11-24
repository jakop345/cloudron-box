/* jslint node:true */

'use strict';

var assert = require('assert'),
    clientdb = require('../clientdb.js'),
    debug = require('debug')('box:routes/user'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    tokendb = require('../tokendb.js'),
    user = require('../user.js'),
    UserError = user.UserError;

exports = module.exports = {
    createAdmin: createAdmin,
    createToken: createToken,
    logout: logout,
    info: info,
    list: listUser,
    create: createUser,
    changePassword: changePassword,
    changeAdmin: changeAdmin,
    remove: removeUser,
    verifyPassword: verifyPassword,
    requireAdmin: requireAdmin
};

/**
* @apiDefinePermission admin Admin access rights needed.
* This can only be called in the context of the box owner/administrator
*/

/**
 * @api {post} /api/v1/createadmin createAdmin
 * @apiName createAdmin
 * @apiGroup generic
 * @apiDescription
 *
 * Creating an admin user also puts the device out of first time activation mode.
 *
 * @apiParam {string} username The administrator's user name
 * @apiParam {string} password The administrator's password
 * @apiParam {string} email The administrator's email address
 *
 * @apiSuccess (Created 201) {string} token A valid access token
 */
function createAdmin(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username must be string'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password must be string'));
    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));

    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;

    debug('createAdmin: ' + username);

    user.create(username, password, email, true /* admin */, function (error) {
        if (error && error.reason === UserError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error) return next(new HttpError(500, error));

        // Also generate a token so the admin creation can also act as a login
        var token = tokendb.generateToken();
        var expires = new Date(Date.now() + 60 * 60000).toUTCString(); // 1 hour

        debug('createAdmin: now create token for ' + username);

        clientdb.getByAppId('webadmin', function (error, result) {
            if (error) return next(new HttpError(500, error));

            tokendb.add(token, username, result.id, expires, '*', function (error) {
                if (error) return next(new HttpError(500, error));

                debug('createAdmin: successful with token ' + token);

                var userInfo = {
                    username: username,
                    email: email,
                    admin: true
                };

                // TODO no next(), as we do not want to fall through to authentication
                // the whole createAdmin should be handled differently
                res.send(201, {
                    token: token,
                    expires: expires,
                    userInfo: userInfo
                });
            });
        });
    });
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
 * @apiParam {string} password The new users's password
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
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password must be string'));
    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));

    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;

    user.create(username, password, email, false /* admin */, function (error) {
        if (error && error.reason === UserError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === UserError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error) return next(new HttpError(500, error));

        var userInfo = {
            username: username,
            email: email,
            admin: false
        };

        next(new HttpSuccess(201, { userInfo: userInfo }));
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

    user.changePassword(req.user.username, req.body.password, req.body.newPassword, function (error) {
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
 * @api {get} /api/v1/token token
 * @apiName token
 * @apiGroup user
 * @apiDescription
 * This route may be used to verify a user and retrieve an access token for further API access.
 * As any other route, the authentication is using the auth header.
 *
 * @apiSuccess {String} token Access token to be used for further API calls
 * @apiSuccess {Date} expires Expiration date for the access token
 * @apiSuccess {String} username Username associated with the access token
 * @apiSuccess {String} email Email associated with the access token
 */
function createToken(req, res, next) {
    assert(typeof req.user === 'object');

    var token = tokendb.generateToken();
    var expires = new Date(Date.now() + 60 * 60000).toUTCString(); // 1 hour

    tokendb.add(token, req.user.username, null, expires, '*', function (err) {
        if (err) return next(new HttpError(500, err));
        next(new HttpSuccess(200, {
            token: token,
            expires: expires,
            userInfo: {
                username: req.user.username,
                email: req.user.email,
                admin: req.user.admin
            }
        }));
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
    assert(typeof req.user === 'object');

    next(new HttpSuccess(200, {
        username: req.user.username,
        email: req.user.email,
        admin: req.user.admin
    }));
}

/**
 * @api {get} /api/v1/logout logout
 * @apiName logout
 * @apiGroup user
 * @apiDescription
 * Invalidates all access tokens associated with this user.
 *
 * @apiSuccess none User successfully logged out
 */
function logout(req, res, next) {
    var req_token = req.query.access_token ? req.query.access_token : req.cookies.token;

    // Invalidate token so the cookie cannot be reused after logout
    tokendb.del(req_token, function (error) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(204));
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
    assert(typeof req.body === 'object');

    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username must be string'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password must be string'));

    var username = req.body.username;
    var password = req.body.password;

    // rules:
    // - admin can remove any user
    // - admin cannot remove admin

    if (req.user.username === username) return next(new HttpError(403, 'Not allowed to remove this user.'));

    user.remove(username, function (error) {
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(404, 'User not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function verifyPassword(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'API call requires user password'));

    user.verify(req.user.username, req.body.password, function (error) {
        if (error && error.reason === UserError.WRONG_PASSWORD) return next(new HttpError(403, 'Password incorrect'));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(403, 'Password incorrect'));
        if (error) return next(new HttpError(500, error));

        next();
    });
};

/*
    Middleware which makes the route only accessable for the admin user.
*/
function requireAdmin(req, res, next) {
    assert(typeof req.user === 'object');

    if (!req.user.admin) return next(new HttpError(403, 'API call requires the admin rights.'));

    next();
};

