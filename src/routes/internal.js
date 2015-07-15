/* jslint node:true */

'use strict';

exports = module.exports = {
    backup: backup
};

var cloudron = require('../cloudron.js'),
    debug = require('debug')('box:routes/internal'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess;

function backup(req, res, next) {
    debug('trigger backup');

    cloudron.backup(function (error) {
        if (error) debug('Internal route backup failed', error);
    });

    // we always succeed to trigger a backup
    next(new HttpSuccess(202, {}));
}
