'use strict';

exports = module.exports = {
    add: add,
    get: get,
    del: del,
    getAll: getAll,
    addClientToken: addClientToken,
    getClientTokens: getClientTokens,
    delClientTokens: delClientTokens,
    delToken: delToken
};

var assert = require('assert'),
    clients = require('../clients.js'),
    ClientsError = clients.ClientsError,
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    validUrl = require('valid-url');

function add(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (typeof data.appId !== 'string' || !data.appId) return next(new HttpError(400, 'appId is required'));
    if (typeof data.redirectURI !== 'string' || !data.redirectURI) return next(new HttpError(400, 'redirectURI is required'));
    if (typeof data.scope !== 'string' || !data.scope) return next(new HttpError(400, 'scope is required'));
    if (!validUrl.isWebUri(data.redirectURI)) return next(new HttpError(400, 'redirectURI must be a valid uri'));

    clients.add(data.appId, clients.TYPE_EXTERNAL, data.redirectURI, data.scope, function (error, result) {
        if (error && error.reason === ClientsError.INVALID_SCOPE) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(201, result));
    });
}

function get(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');

    clients.get(req.params.clientId, function (error, result) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, result));
    });
}

function del(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');

    clients.get(req.params.clientId, function (error, result) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
        if (error) return next(new HttpError(500, error));

        // we do not allow to use the REST API to delete addon clients
        if (result.type !== clients.TYPE_EXTERNAL) return next(new HttpError(405, 'Deleting app addon clients is not allowed.'));

        clients.del(req.params.clientId, function (error, result) {
            if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
            if (error && error.reason === ClientsError.NOT_ALLOWED) return next(new HttpError(405, error.message));
            if (error) return next(new HttpError(500, error));
            next(new HttpSuccess(204, result));
        });
    });
}

function getAll(req, res, next) {
    clients.getAll(function (error, result) {
        if (error && error.reason !== ClientsError.NOT_FOUND) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { clients: result }));
    });
}

function addClientToken(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');
    assert.strictEqual(typeof req.user, 'object');

    var expiresAt = req.query.expiresAt ? parseInt(req.query.expiresAt, 10) : Date.now() + 24 * 60 * 60 * 1000; // default 1 day;
    if (isNaN(expiresAt) || expiresAt <= Date.now()) return next(new HttpError(400, 'expiresAt must be a timestamp in the future'));

    clients.addClientTokenByUserId(req.params.clientId, req.user.id, expiresAt, function (error, result) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(201, { token: result }));
    });
}

function getClientTokens(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');
    assert.strictEqual(typeof req.user, 'object');

    clients.getClientTokensByUserId(req.params.clientId, req.user.id, function (error, result) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { tokens: result }));
    });
}

function delClientTokens(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');
    assert.strictEqual(typeof req.user, 'object');

    clients.delClientTokensByUserId(req.params.clientId, req.user.id, function (error) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(204));
    });
}

function delToken(req, res, next) {
    assert.strictEqual(typeof req.params.clientId, 'string');
    assert.strictEqual(typeof req.params.tokenId, 'string');
    assert.strictEqual(typeof req.user, 'object');

    clients.delToken(req.params.clientId, req.params.tokenId, function (error) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(404, error.message));
        if (error && error.reason === ClientsError.INVALID_TOKEN) return next(new HttpError(404, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}
