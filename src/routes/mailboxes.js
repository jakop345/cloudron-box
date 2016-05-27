'use strict';

exports = module.exports = {
    list: list,
    get: get,
    remove: remove,
    create: create
};

var assert = require('assert'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    mailboxes = require('../mailboxes.js'),
    MailboxError = mailboxes.MailboxError;

function create(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.name !== 'string') return next(new HttpError(400, 'name must be string'));

    mailboxes.add(req.body.name, function (error, mailbox) {
        if (error && error.reason === MailboxError.BAD_NAME) return next(new HttpError(400, error.message));
        if (error && error.reason === MailboxError.ALREADY_EXISTS) return next(new HttpError(409, 'Already exists'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(201, mailbox));
    });
}

function get(req, res, next) {
    assert.strictEqual(typeof req.params.mailboxId, 'string');

    mailboxes.get(req.params.mailboxId, function (error, result) {
        if (error && error.reason === MailboxError.NOT_FOUND) return next(new HttpError(404, 'No such group'));
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
