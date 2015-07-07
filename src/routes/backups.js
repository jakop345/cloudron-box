/* jslint node:true */

'use strict';


exports.get = get;
exports.create = create;


var backups = require('../backups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function get(req, res, next) {
    backups.getAllPaged(1, 5, function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { backups: result }));
    });
}

function create(req, res, next) {
    backups.scheduleBackup(function (error) {
        if (error) return next(new HttpError(500, error));
       next(new HttpSuccess(202, {}));
    });
}
