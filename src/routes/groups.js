/* jslint node:true */

'use strict';

exports = module.exports = {
    get: get,
    list: list,
    create: create,
    remove: remove
};

var assert = require('assert'),
    groups = require('../groups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    groups = require('../groups.js'),
    GroupError = groups.GroupError;

function create(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.name !== 'string') return next(new HttpError(400, 'name must be string'));

    groups.create(req.body.name, function (error, group) {
        if (error && error.reason === GroupError.BAD_NAME) return next(new HttpError(400, error.message));
        if (error && error.reason === GroupError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error) return next(new HttpError(500, error));

        var groupInfo = {
            id: group.id,
            name: group.name
        };

        next(new HttpSuccess(201, groupInfo));
    });
}

function get(req, res, next) {
    assert.strictEqual(typeof req.params.groupId, 'string');

    groups.get(req.params.groupId, function (error, result) {
        if (error && error.reason === GroupError.NOT_FOUND) return next(new HttpError(404, 'No such group'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, result));
    });
}

function list(req, res, next) {
    groups.list(function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { groups: result }));
    });
}

function remove(req, res, next) {
    assert.strictEqual(typeof req.params.groupId, 'string');

    groups.remove(req.params.groupId, function (error) {
        if (error && error.reason === GroupError.NOT_FOUND) return next(new HttpError(404, 'Group not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}
