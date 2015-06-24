/* jslint node:true */

'use strict';


exports.add = add;
exports.get = get;
exports.update = update;
exports.del = del;
exports.getAllByUserId = getAllByUserId;
exports.getClientTokens = getClientTokens;
exports.delClientTokens = delClientTokens;


var assert = require('assert'),
    validUrl = require('valid-url'),
    clients = require('../clients.js'),
    ClientsError = clients.ClientsError,
    DatabaseError = require('../databaseerror.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function add(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (typeof data.appId !== 'string' || !data.appId) return next(new HttpError(400, 'appId is required'));
    if (typeof data.redirectURI !== 'string' || !data.redirectURI) return next(new HttpError(400, 'redirectURI is required'));
    if (typeof data.scope !== 'string' || !data.scope) return next(new HttpError(400, 'scope is required'));
    if (!validUrl.isWebUri(data.redirectURI)) return next(new HttpError(400, 'redirectURI must be a valid uri'));

    // prefix as this route only allows external apps for developers
    var appId = 'external-' + data.appId;

    clients.add(appId, data.redirectURI, data.scope, function (error, result) {
        if (error && error.reason === ClientsError.INVALID_SCOPE) return next(new HttpError(400, 'Invalid scope'));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(201, result));
    });
}

function get(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');

    clients.get(req.params.clientId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such client'));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, result));
    });
}

function update(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');

    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (typeof data.appId !== 'string' || !data.appId) return next(new HttpError(400, 'appId is required'));
    if (typeof data.redirectURI !== 'string' || !data.redirectURI) return next(new HttpError(400, 'redirectURI is required'));
    if (!validUrl.isWebUri(data.redirectURI)) return next(new HttpError(400, 'redirectURI must be a valid uri'));

    clients.update(req.params.clientId, data.appId, data.redirectURI, function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(202, result));
    });
}

function del(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');

    clients.del(req.params.clientId, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'no such client'));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(204, result));
    });
}

function getAllByUserId(req, res, next) {
    clients.getAllWithDetailsByUserId(req.user.id, function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { clients: result }));
    });
}

function getClientTokens(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');
    assert.strictEqual(typeof req.user, 'object');

    clients.getClientTokensByUserId(req.params.clientId, req.user.id, function (error, result) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'no such client'));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { tokens: result }));
    });
}

function delClientTokens(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');
    assert.strictEqual(typeof req.user, 'object');

    clients.delClientTokensByUserId(req.params.clientId, req.user.id, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'no such client'));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(204));
    });
}
