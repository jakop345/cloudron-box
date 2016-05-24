'use strict';

exports = module.exports = {
    initialize: initialize
};

var config = require('./config.js'),
    certificates = require('./certificates.js'),
    debug = require('debug')('box:platform'),
    path = require('path'),
    paths = require('./paths.js'),
    shell = require('./shell.js');

var SETUP_INFRA_CMD = path.join(__dirname, 'scripts/setup_infra.sh');

function initialize(callback) {
    if (process.env.BOX_ENV === 'test' && !process.env.CREATE_INFRA) return callback();

    debug('initializing addon infrastructure');
    certificates.getAdminCertificatePath(function (error, certFilePath, keyFilePath) {
        if (error) return callback(error);

        shell.sudo('seutp_infra', [ SETUP_INFRA_CMD, paths.DATA_DIR, config.fqdn(), config.adminFqdn(), certFilePath, keyFilePath, config.database().name, config.database().password ], callback);
    });
}
