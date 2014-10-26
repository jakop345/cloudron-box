/* jslint node:true */

'use strict';

var debug = require('debug')('box:routes/installer'),
    HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    installer = require('../installer.js'),
    InstallerError = require('../installer.js').InstallerError;

exports = module.exports = {
    provision: provision,
    restore: restore
};

function restore(req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.appServerUrl) return next(new HttpError(400, 'No appServerUrl provided'));
    if (!req.body.adminOrigin) return next(new HttpError(400, 'No adminOrigin provided'));
    if (!req.body.fqdn) return next(new HttpError(400, 'No fqdn provided'));
    if (!req.body.ip) return next(new HttpError(400, 'No ip provided'));
    if (!('tls' in req.body)) return next(new HttpError(400, 'tls cert must be provided or be null'));
    if (!req.body.restoreUrl) return next(new HttpError(400, 'No restoreUrl provided'));

    debug('_restore: received from appstore ', req.body);

    installer.restore(req.body, function (error) {
        if (error && error.reason === InstallerError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already provisioned'));
        if (error) return next(new HttpError(500, error));

        return next(new HttpSuccess(200, { }));
    });
}

function provision(req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.appServerUrl) return next(new HttpError(400, 'No appServerUrl provided'));
    if (!req.body.adminOrigin) return next(new HttpError(400, 'No adminOrigin provided'));
    if (!req.body.fqdn) return next(new HttpError(400, 'No fqdn provided'));
    if (!req.body.ip) return next(new HttpError(400, 'No ip provided'));
    if (!('tls' in req.body)) return next(new HttpError(400, 'tls cert must be provided or be null'));

    debug('_provision: received from appstore ' + req.body.appServerUrl);

    installer.provision(req.body, function (error) {
        if (error && error.reason === InstallerError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already provisioned'));
        if (error) return next(new HttpError(500, error));

        return next(new HttpSuccess(201, { }));
    });
}

