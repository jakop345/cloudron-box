'use strict';

var userdb = require('./userdb'),
    DatabaseError = require('./databaseerror'),
    crypto = require('crypto'),
    debug = require('debug')('authserver:user'),
    HttpError = require('../api/httperror'),
    HttpSuccess = require('../api/httpsuccess');

exports = module.exports = {
    owner: owner,
    add: add,
    get: get,
    getAll: getAll,
    remove: remove
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
    debug('get');

    console.log('---', req.user);
}

function getAll(req, res, next) {
    debug('getAll');

    userdb.getAll(function (error, result) {
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, { users: result }));
    });
}

function remove(req, res, next) {
    debug('remove: ' + req.body.userId + ' ' + req.body.password);

    if (!req.body.userId) return next(new HttpError(400, 'No username provided'));
    if (!req.body.password) return next(new HttpError(400, 'No password provided'));

    // TODO check password
    userdb.del(req.body.userId, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such user'));
        if (error) return next(new HttpError(500));
        next(new HttpSuccess(200, {}));
    });
}
