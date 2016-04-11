'use strict';

exports = module.exports = {
    get: get,
    create: create,
    download: download
};

var assert = require('assert'),
    backups = require('../backups.js'),
    BackupsError = require('../backups.js').BackupsError,
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function get(req, res, next) {
    var page = typeof req.query.page !== 'undefined' ? parseInt(req.query.page) : 1;
    if (!page || page < 0) return next(new HttpError(400, 'page query param has to be a postive number'));

    var perPage = typeof req.query.per_page !== 'undefined'? parseInt(req.query.per_page) : 25;
    if (!perPage || perPage < 0) return next(new HttpError(400, 'per_page query param has to be a postive number'));

    backups.getPaged(page, perPage, function (error, result) {
        if (error && error.reason === BackupsError.EXTERNAL_ERROR) return next(new HttpError(503, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { backups: result }));
    });
}

function create(req, res, next) {
    // note that cloudron.backup only waits for backup initiation and not for backup to complete
    // backup progress can be checked up ny polling the progress api call
    backups.backup(function (error) {
        if (error && error.reason === BackupsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function download(req, res, next) {
    assert.strictEqual(typeof req.params.backupId, 'string');

    backups.getRestoreUrl(req.params.backupId, function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, result));
    });
}
