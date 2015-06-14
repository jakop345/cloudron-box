/* jslint node:true */

'use strict';

var assert = require('assert'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    settings = require('../settings.js'),
    SettingsError = settings.SettingsError;

exports = module.exports = {
    getAutoupdatePattern: getAutoupdatePattern,
    setAutoupdatePattern: setAutoupdatePattern
};

function getAutoupdatePattern(req, res, next) {
    settings.getAutoupdatePattern(function (error, pattern) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { pattern: pattern }));
    });
}

function setAutoupdatePattern(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.pattern !== 'string') return next(new HttpError(400, 'pattern is required'));

    settings.setAutoupdatePattern(req.body.pattern, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, 'Invalid pattern'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

