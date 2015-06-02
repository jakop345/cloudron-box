/* jslint node:true */

'use strict';

var debug = require('debug')('box:routes/internal'),
    cloudron = require('../cloudron.js'),
    HttpSuccess = require('connect-lastmile').HttpSuccess;

exports = module.exports = {
    backup: backup
};

function backup(req, res, next) {
    debug('trigger backup');

    // we always succeed to trigger a backup
    next(new HttpSuccess(202, {}));

    cloudron.backup(function (error) {
        if (error) console.error('backup failed.', error);
        debug('backup success');
    });
}
