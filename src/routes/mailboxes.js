'use strict';

exports = module.exports = {
    list: list,
    get: get,
    remove: remove,
    create: create,
    setAliases: setAliases,
    getAliases: getAliases
};

var assert = require('assert'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    mailboxes = require('../mailboxes.js'),
    MailboxError = mailboxes.MailboxError,
    util = require('util');

function create(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.name !== 'string') return next(new HttpError(400, 'name must be string'));

    mailboxes.add(req.body.name, function (error, mailbox) {
        if (error && error.reason === MailboxError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === MailboxError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(201, mailbox));
    });
}

function get(req, res, next) {
    assert.strictEqual(typeof req.params.mailboxId, 'string');

    mailboxes.get(req.params.mailboxId, function (error, result) {
        if (error && error.reason === MailboxError.NOT_FOUND) return next(new HttpError(404, 'No such mailbox'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, result));
    });
}

function list(req, res, next) {
    mailboxes.getAll(function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { mailboxes: result }));
    });
}

function remove(req, res, next) {
    assert.strictEqual(typeof req.params.mailboxId, 'string');

    mailboxes.del(req.params.mailboxId, function (error) {
        if (error && error.reason === MailboxError.NOT_FOUND) return next(new HttpError(404, 'Mailbox not found'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function setAliases(req, res, next) {
    assert.strictEqual(typeof req.params.mailboxId, 'string');

    if (!util.isArray(req.body.aliases)) return next(new HttpError(400, 'aliases must be an array'));

    for (var i = 0; i < req.body.aliases.length; i++) {
        if (typeof req.body.aliases[i] !== 'string') return next(new HttpError(400, 'alias must be a string'));
    }

    mailboxes.setAliases(req.params.mailboxId, req.body.aliases, function (error) {
        if (error && error.reason === MailboxError.NOT_FOUND) return next(new HttpError(404, 'No such mailbox'));
        if (error && error.reason === MailboxError.BAD_FIELD) return next(new HttpError(400, error.reason));
        if (error && error.reason === MailboxError.ALREADY_EXISTS) return next(new HttpError(409, 'One or more alias already exist'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

function getAliases(req, res, next) {
    assert.strictEqual(typeof req.params.mailboxId, 'string');

    mailboxes.getAliases(req.params.mailboxId, function (error, aliases) {
        if (error && error.reason === MailboxError.NOT_FOUND) return next(new HttpError(404, 'No such mailbox'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { aliases: aliases }));
    });
}
