/* jslint node:true */

'use strict';

exports = module.exports = {
    backup: backup,
    update: update,
    retire: retire
};

var cloudron = require('../cloudron.js'),
    CloudronError = require('../cloudron.js').CloudronError,
    debug = require('debug')('box:routes/internal'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function backup(req, res, next) {
    debug('triggering backup');

    // note that cloudron.backup only waits for backup initiation and not for backup to complete
    // backup progress can be checked up ny polling the progress api call
    cloudron.backup(function (error) {
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function update(req, res, next) {
    debug('triggering update');

    // this only initiates the update, progress can be checked via the progress route
    cloudron.updateToLatest(function (error) {
        if (error && error.reason === CloudronError.ALREADY_UPTODATE) return next(new HttpError(422, error.message));
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function retire(req, res, next) {
    debug('triggering retire');

    // note that cloudron.backup only waits for backup initiation and not for backup to complete
    // backup progress can be checked up ny polling the progress api call
    cloudron.retire(function (error) {
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}
