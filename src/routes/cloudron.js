/* jslint node:true */

'use strict';

var cloudron = require('../cloudron.js'),
    CloudronError = cloudron.CloudronError,
    debug = require('debug')('box:routes/cloudron'),
    df = require('nodejs-disks'),
    execFile = require('child_process').execFile,
    HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    path = require('path');

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
    // TODO is there a better way?
    next(new HttpSuccess(200, {}));

    execFile(SUDO, [ REBOOT_CMD ], {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Reboot failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_reboot: success');
    });
}

function createBackup(req, res, next) {
    cloudron.backup();

    next(new HttpSuccess(200, {}));
}

function getConfig(req, res, next) {
    cloudron.getConfig(function (error, cloudronConfig) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, cloudronConfig));
    });
}

function update(req, res, next) {
    cloudron.update(function (error) {
        if (error) return next(new HttpError(500, error));

        res.send(200, { });
    });
};

