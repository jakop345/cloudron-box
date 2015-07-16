/* jslint node:true */

'use strict';

exports = module.exports = {
    get: get,
    create: create
};

var backups = require('../backups.js'),
    cloudron = require('../cloudron.js'),
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
    // don't want for backup to complete since this can take long
    // progress can be checked up ny polling the progress api call
    cloudron.backup(function (error) {
        if (error) debug('Could not backup', error);
    });

    next(new HttpSuccess(202, {}));
}
