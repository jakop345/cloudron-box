'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('server:routes/apps'),
    apps = require('../apps.js');

exports = module.exports = {
    initialize: initialize,
    installApp: installApp
};

var appServerUrl = null;

function initialize(config) {
    appServerUrl = config.appServerUrl;
}

function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field:' + safe.error.message));
    if (!data.app_id) return next(new HttpError(400, 'app_id is required'));

    console.log('will install app with id ' + data.app_id);

    apps.install(data.app_id, function (error) {
        if (error) return next(new HttpError(400, 'Error installing app: ' + error));
        next(new HttpSuccess(200));
    });
}

