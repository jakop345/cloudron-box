/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/backups'),
    backups = require('../backups.js');

exports = module.exports = {
    createBackup: createBackup
};

function createBackup(req, res, next) {
    backups.createBackup();

    next(new HttpSuccess(200, {}));
}

