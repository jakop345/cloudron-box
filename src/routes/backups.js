/* jslint node:true */

'use strict';

var assert = require('assert'),
    backups = require('../backups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    get: get
};

function get(req, res, next) {
    backups.getAll(function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { backups: result }));
    });
}
