'use strict';

var DatabaseError = require('./databaseerror.js'),
    util = require('util'),
    debug = require('debug')('server:app'),
    assert = require('assert'),
    safe = require('safetydance'),
    appdb = require('./appdb.js'),
    superagent = require('superagent');

exports = module.exports = {
    install: install
};

var STATUS_PENDING = 'pending';

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

function install(appId, callback) {
    appdb.add(appId, { status: STATUS_PENDING }, function (error) {
        if (error && error.reason === DatabaseError.ALREADY_EXISTS) return next(new HttpError(400, 'Already installed or installing'));
        if (error) return next(new HttpError(500, 'Internal error:' + error.message));

        process.nextTick(installTask);

        next(new HttpSuccess(200, { status: 'Downloading' }));
    });
}

