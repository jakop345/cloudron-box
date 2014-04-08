'use strict';

var userdb = require('./userdb'),
    tokendb = require('./tokendb'),
    DatabaseError = require('./databaseerror'),
    debug = require('debug')('authserver:user'),
    HttpError = require('../common/httperror'),
    HttpSuccess = require('../common/httpsuccess');

exports = module.exports = {
    owner: owner,
    add: add,
    get: get,
    getAll: getAll,
    remove: remove,
    token: token
};

function owner(req, res, next) {
    debug('add owner: ' + req.body.username + ' ' + req.body.password + ' ' + req.body.email);

    if (!req.body.username) return next(new HttpError(400, 'No username provided'));
    if (!req.body.password) return next(new HttpError(400, 'No password provided'));
    if (!req.body.email) return next(new HttpError(400, 'No email provided'));

    userdb.add(req.body.username, req.body.username, req.body.password, req.body.email, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return next(new HttpError(409, 'User already exists'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(201, {}));
    });
}

function add(req, res, next) {
    debug('add user: ' + req.body.username + ' ' + req.body.password + ' ' + req.body.email);

    if (!req.body.username) return next(new HttpError(400, 'No username provided'));
    if (!req.body.password) return next(new HttpError(400, 'No password provided'));
    if (!req.body.email) return next(new HttpError(400, 'No email provided'));

    userdb.add(req.body.username, req.body.username, req.body.password, req.body.email, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return next(new HttpError(409, 'User already exists'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(201, {}));
    });
}

function get(req, res, next) {
    debug('get: ' + req.params.userId);

    if (!req.params.userId) return next(new HttpError(400, 'No userId provided'));

    userdb.get(req.params.userId, function (error, user) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such user'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, userdb.removePrivates(user)));
    });
}

function getAll(req, res, next) {
    debug('getAll');

    userdb.getAll(function (error, result) {
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, { users: result }));
    });
}

function remove(req, res, next) {
    debug('remove: ' + req.params.userId + ' ' + req.body.password);

    if (!req.params.userId) return next(new HttpError(400, 'No username provided'));
    // if (!req.body.password) return next(new HttpError(400, 'No password provided'));

    // TODO check password
    userdb.del(req.params.userId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such user'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, {}));
    });
}

function token(req, res, next) {
    debug('token: ' + JSON.stringify(req.user));

    var accessToken = tokendb.generateToken();
    tokendb.add(accessToken, req.user.id, null, function (error) {
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, { accessToken: accessToken }));
    });
}
