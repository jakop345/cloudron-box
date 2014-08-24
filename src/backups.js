/* jslint node:true */

'use strict';

var config = require('../config.js'),
    debug = require('debug')('box:backups'),
    exec = require('child_process').exec;

exports = module.exports = {
    createBackup: createBackup
};

var BACKUP_CMD = 'sudo ' + __dirname + '/backup.sh';

function createBackup() {
    debug('Starting backup script');

    var args = config.aws.accessKeyId + ' ' + config.aws.secretAccessKey + ' ' + config.aws.prefix + ' ' + config.aws.bucket;

    exec(BACKUP_CMD + ' ' + args, function (error) {
        if (error) console.error('Error starting backup command', error);
    });
}

