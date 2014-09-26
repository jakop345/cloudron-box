/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/cloudron'),
    exec = require('child_process').exec,
    df = require('nodejs-disks'),
    path = require('path'),
    cloudron = require('../cloudron.js'),
    config = require('../../config.js'),
    exec = require('child_process').exec,
    backups = require('../backups.js');

var REBOOT_CMD = 'sudo ' + path.join(__dirname, '../scripts/reboot.sh');

exports = module.exports = {
    getStats: getStats,
    reboot: reboot,
    createBackup: createBackup,
    restore: restore,
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
};

function reboot(req, res, next) {
    debug('_reboot: execute "%s".', REBOOT_CMD);

    // Finish the request, to let the appstore know we triggered the restore it
    // TODO is there a better way?
    next(new HttpSuccess(200, {}));

    exec(REBOOT_CMD, {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Reboot failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_reboot: success');
    });
};

function createBackup(req, res, next) {
    backups.createBackup();

    next(new HttpSuccess(200, {}));
}

function restore(req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.fileName) return next(new HttpError(400, 'No restore file name provided'));
    if (!req.body.aws) return next(new HttpError(400, 'No aws credentials provided'));
    if (!req.body.aws.prefix) return next(new HttpError(400, 'No aws prefix provided'));
    if (!req.body.aws.bucket) return next(new HttpError(400, 'No aws bucket provided'));
    if (!req.body.aws.accessKeyId) return next(new HttpError(400, 'No aws access key provided'));
    if (!req.body.aws.secretAccessKey) return next(new HttpError(400, 'No aws secret provided'));

    debug('_restore: received from appstore ' + req.body.appServerUrl);

    cloudron.restore(req.body, function (error) {
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

