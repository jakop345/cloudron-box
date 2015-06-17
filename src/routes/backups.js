/* jslint node:true */

'use strict';

var assert = require('assert'),
    backups = require('../backups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    get: get,
    create: create
};

function get(req, res, next) {
    backups.getAll(function (error, result) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { backups: result }));
    });
}

function create(req, res, next) {
    backups.create(function (error) {
        if (error) return next(new HttpError(500, error));
       next(new HttpSuccess(202, {}));
    });
}