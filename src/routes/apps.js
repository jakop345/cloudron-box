/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('server:routes/apps'),
    apps = require('../apps.js'),
    AppsError = apps.AppsError;

exports = module.exports = {
    initialize: initialize,
    installApp: installApp
};

function initialize(config) {
}

function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.app_id) return next(new HttpError(400, 'app_id is required'));
    if (!data.password) return next(new HttpError(400, 'password is required'));
    if (!data.config) return next(new HttpError(400, 'config is required'));

    console.log('will install app with id ' + data.app_id);

    apps.install(data.app_id, req.user.username, data.password, data.config, function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, 'Error installing app: ' + error));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, { status: 'ok' } ));
    });
}

