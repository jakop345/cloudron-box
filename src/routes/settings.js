/* jslint node:true */

'use strict';

var assert = require('assert'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    settings = require('../settings.js'),
    SettingsError = settings.SettingsError;

exports = module.exports = {
    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain,

    getAutoupdatePattern: getAutoupdatePattern,
    setAutoupdatePattern: setAutoupdatePattern
};

function getNakedDomain(req, res, next) {
    settings.getNakedDomain(function (error, nakedDomain) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { appid: nakedDomain }));
    });
}

function setNakedDomain(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.appid !== 'string') return next(new HttpError(400, 'appid is required'));

    settings.setNakedDomain(req.body.appid, function (error) {
        if (error && error.reason === SettingsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(204));
    });
}

function getAutoupdatePattern(req, res, next) {
    settings.getAutoupdatePattern(function (error, pattern) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { pattern: pattern }));
    });
}

function setAutoupdatePattern(req, res, next) {
    assert(typeof req.body === 'object');

    if (typeof req.body.pattern !== 'string') return next(new HttpError(400, 'pattern is required'));

    settings.setAutoupdatePattern(req.body.pattern, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, 'Invalid pattern'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

