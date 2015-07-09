/* jslint node:true */

'use strict';

exports = module.exports = {
    backup: backup
};

var debug = require('debug')('box:routes/internal'),
    backups = require('../backups.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function backup(req, res, next) {
    debug('trigger backup');

    backups.scheduleBackup(function (error) {
        if (error) return next(new HttpError(500, error));

        // we always succeed to trigger a backup
        next(new HttpSuccess(202, {}));
    });
}
