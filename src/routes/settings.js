/* jslint node:true */

'use strict';

var assert = require('assert'),
    debug = require('debug')('box:routes/settings'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    settings = require('../settings.js'),
    SettingsError = settings.SettingsError;

exports = module.exports = {
    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain
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

