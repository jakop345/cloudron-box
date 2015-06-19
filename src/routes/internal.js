/* jslint node:true */

'use strict';

var debug = require('debug')('box:routes/internal'),
    backups = require('../backups.js'),
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    backup: backup
};

function backup(req, res, next) {
    debug('trigger backup');

    backups.scheduleBackup(function (error) {
        if (error) return next(new HttpError(500, error));

        // we always succeed to trigger a backup
        next(new HttpSuccess(202, {}));
    });
}
