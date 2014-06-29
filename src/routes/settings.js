/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/settings'),
    settingsdb = require('../settingsdb.js'),
    DatabaseError = require('../databaseerror.js'),
    apptask = require('../apptask.js'),
    appdb = require('../appdb.js');

exports = module.exports = {
    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain
};

function getNakedDomain(req, res, next) {
    settingsdb.get(settingsdb.NAKED_DOMAIN_KEY, function (error, value) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpSuccess(200, { appid: '' }));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { appid: value }));
    });
}

function setNakedDomain(req, res, next) {
    var data = req.body;
    if (!data || typeof data.appid !== 'string') return next(new HttpError(400, 'appid is required'));

    function getApp(appid, callback) { return appid !== '' ? appdb.get(appid, callback): callback(null); }

    getApp(data.appid, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such app'));

        apptask.setNakedDomain(app, function (error) {
            if (error) return next(new HttpError(500, 'Error setting naked domain: ' + error));

            settingsdb.set(settingsdb.NAKED_DOMAIN_KEY, data.appid, function (error) {
                if (error) return next(new HttpError(500, 'Internal error: ' + error));

                next(new HttpSuccess(200, { }));
            });
        });
    });
}

