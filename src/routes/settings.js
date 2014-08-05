/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/settings'),
    DatabaseError = require('../databaseerror.js'),
    apptask = require('../apptask.js'),
    config = require('../../config.js'),
    appdb = require('../appdb.js');

exports = module.exports = {
    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain
};

function getNakedDomain(req, res, next) {
    if (config.naked_domain === null) return next(new HttpSuccess(200, { appid: '' }));

    next(new HttpSuccess(200, { appid: config.naked_domain }));
}

function setNakedDomain(req, res, next) {
    var data = req.body;
    if (!data || typeof data.appid !== 'string') return next(new HttpError(400, 'appid is required'));

    function getApp(appid, callback) { return appid !== '' ? appdb.get(appid, callback): callback(null); }

    getApp(data.appid, function (error, app) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(404, 'No such app'));

        apptask.setNakedDomain(app, function (error) {
            if (error) return next(new HttpError(500, 'Error setting naked domain: ' + error));

            config.set('naked_domain', data.appid);
            next(new HttpSuccess(200, { }));
        });
    });
}

