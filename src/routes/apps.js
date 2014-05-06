'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('server:routes/app'),
    superagent = require('superagent'),
    appdb = require('../appdb.js'),
    DatabaseError = require('../databaseerror.js');

exports = module.exports = {
    initialize: initialize,
    installApp: installApp
};

var appServerUrl = null;

function initialize(config) {
    appServerUrl = config.appServerUrl;
}

function installTask() {
    appdb.getAll(function (error, apps) {
        if (error) {
            debug('Error reading apps table ' + error);
            return;
        }

        apps.forEach(function (app) {
            if (app.status === 'Installed') return;

            superagent
                .get(appServerUrl + '/api/v1/app/' + app.id + '/manifest')
                .set('Accept', 'application/x-yaml')
                .end(function (err, res) {
                    console.log(err);
                    console.log(res);
                    res.pipe(process.stdout);
                    // TODO: change status to Downloaded/Error
                    // TODO: actually install the app
            });
        });
    });
}

function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field:' + safe.error.message));
    if (!data.app_id) return next(new HttpError(400, 'app_id is required'));

    console.log('will install app with id ' + data.app_id);

    appdb.add(data.app_id, { status: 'Downloading' }, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return next(new HttpError(400, 'Already installed or installing'));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        process.nextTick(installTask);

        next(new HttpSuccess(200, { status: 'Downloading' }));
    });
}

