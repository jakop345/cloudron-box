'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('server:routes/app');

exports = module.exports = {
    installApp: installApp
};

function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field:' + safe.error.message));
    if (!data.app_id) return next(new HttpError(400, 'app_id is required'));

    console.log('will install app with id ' + data.app_id);
    next(new HttpSuccess(200, { status: 'ok' }));
}

