/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/cloudron'),
    execFile = require('child_process').execFile,
    df = require('nodejs-disks'),
    path = require('path'),
    cloudron = require('../cloudron.js'),
    CloudronError = cloudron.CloudronError,
    config = require('../../config.js'),
    exec = require('child_process').exec,
    _ = require('underscore');

var SUDO = '/usr/bin/sudo',
    REBOOT_CMD = path.join(__dirname, '../scripts/reboot.sh');

exports = module.exports = {
    getStats: getStats,
    reboot: reboot,
    createBackup: createBackup,
    restore: restore,
    getConfig: getConfig,
    update: update,
    provision: provision
};

function getStats(req, res, next) {
    df.drives(function (error, drives) {
        if (error) return next(new HttpError(500, error));

        df.drivesDetail(drives, function (err, data) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(200, { drives: data }));
        });
    });
};

function reboot(req, res, next) {
    debug('_reboot: execute "%s".', REBOOT_CMD);

    // Finish the request, to let the appstore know we triggered the restore it
    // TODO is there a better way?
    next(new HttpSuccess(200, {}));

    execFile(SUDO, [ REBOOT_CMD ], {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Reboot failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_reboot: success');
    });
};

function createBackup(req, res, next) {
    cloudron.backup();

    next(new HttpSuccess(200, {}));
}

function restore(req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.restoreUrl) return next(new HttpError(400, 'No restore url provided'));

    debug('_restore: received from appstore', req.body);

    cloudron.restore(req.body.restoreUrl, req.body.token, function (error) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { }));
    });
};

function getConfig(req, res, next) {
    cloudron.getConfig(function (error, cloudronConfig) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, cloudronConfig));
    });
};

function update(req, res, next) {
    cloudron.update(function (error) {
        if (error) return next(new HttpError(500, error));

        res.send(200, { });
    });
};

function provision(req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.appServerUrl) return next(new HttpError(400, 'No appServerUrl provided'));
    if (!req.body.adminOrigin) return next(new HttpError(400, 'No adminOrigin provided'));
    if (!req.body.fqdn) return next(new HttpError(400, 'No fqdn provided'));
    if (!req.body.ip) return next(new HttpError(400, 'No ip provided'));
    if (!('tls' in req.body)) return next(new HttpError(400, 'tls cert must be provided or be null'));

    debug('_provision: received from appstore ' + req.body.appServerUrl);

    cloudron.provision(req.body, function (error) {
        if (error && error.reason === CloudronError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already provisioned'));
        if (error) return next(new HttpError(500, error));

        return next(new HttpSuccess(201, { }));
    });
};

