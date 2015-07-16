/* jslint node:true */

'use strict';

exports = module.exports = {
    get: get,
    create: create
};

var backups = require('../backups.js'),
    cloudron = require('../cloudron.js'),
    CloudronError = require('../cloudron.js').CloudronError,
    debug = require('debug')('box:routes/backups'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function get(req, res, next) {
    backups.getAllPaged(1, 5, function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { backups: result }));
    });
}

function create(req, res, next) {
    // note that cloudron.backup only waits for backup initiation and not for backup to complete
    // backup progress can be checked up ny polling the progress api call
    cloudron.backup(function (error) {
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}
