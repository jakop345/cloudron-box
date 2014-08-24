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

    var env = {
        S3_KEY : config.aws.accessKeyId,
        S3_SECRET: config.aws.secretAccessKey,
        S3_PREFIX: config.aws.prefix,
        S3_BUCKET: config.aws.bucket
    };

    exec(BACKUP_CMD, { env: env }, function (error) {
        if (error) console.error('Error starting backup command', error);
    });
}

