/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/settings'),
    DatabaseError = require('../databaseerror.js'),
    settingsdb = require('../settingsdb.js'),
    apptask = require('../apptask.js'),
    apps = require('../apps.js'),
    AppsError = apps.AppsError;

exports = module.exports = {
    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain
};

function getNakedDomain(req, res, next) {
    settingsdb.getNakedDomain(function (error, nakedDomain) {
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        if (nakedDomain === null) return next(new HttpSuccess(200, { appid: '' }));

        next(new HttpSuccess(200, { appid: nakedDomain }));
    });
}

function setNakedDomain(req, res, next) {
    var data = req.body;
    if (!data || typeof data.appid !== 'string') return next(new HttpError(400, 'appid is required'));

    function getApp(appid, callback) { return appid !== '' ? apps.get(appid, callback): callback(null); }

    getApp(data.appid, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));

        // TODO: apptask and db update needs to be atomic
        apptask.setNakedDomain(app, function (error) {
            if (error) return next(new HttpError(500, 'Error setting naked domain: ' + error));

            settingsdb.setNakedDomain(data.appid, function (error) {
                if (error) return next(new HttpError(500, 'Error settings naked domain: ' + error));

                next(new HttpSuccess(200, { }));
            });
        });
    });
}

