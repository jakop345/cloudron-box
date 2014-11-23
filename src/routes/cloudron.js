/* jslint node:true */

'use strict';

var assert = require('assert'),
    cloudron = require('../cloudron.js'),
    CloudronError = cloudron.CloudronError,
    debug = require('debug')('box:routes/cloudron'),
    df = require('nodejs-disks'),
    execFile = require('child_process').execFile,
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    path = require('path'),
    updater = require('../updater.js');

var SUDO = '/usr/bin/sudo',
    REBOOT_CMD = path.join(__dirname, '../scripts/reboot.sh');

exports = module.exports = {
    getStats: getStats,
    reboot: reboot,
    createBackup: createBackup,
    getConfig: getConfig,
    update: update
};

function getStats(req, res, next) {
    df.drives(function (error, drives) {
        if (error) return next(new HttpError(500, error));

        df.drivesDetail(drives, function (err, data) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(200, { drives: data }));
        });
    });
}

function reboot(req, res, next) {
    debug('_reboot: execute "%s".', REBOOT_CMD);

    // Finish the request, to let the appstore know we triggered the restore it
    next(new HttpSuccess(202, {}));

    execFile(SUDO, [ REBOOT_CMD ], {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Reboot failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_reboot: success');
    });
}

function createBackup(req, res, next) {
    cloudron.backup(function (error) {
        if (error && error.reason === CloudronError.APPSTORE_DOWN) return next(new HttpError(503, error));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function getConfig(req, res, next) {
    cloudron.getConfig(function (error, cloudronConfig) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, cloudronConfig));
    });
}

function update(req, res, next) {
    updater.update(function (error) {
        if (error) return next(new HttpError(500, error));

        res.send(202, { });
    });
};

