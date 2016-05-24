'use strict';

exports = module.exports = {
    initialize: initialize
};

var apps = require('./apps.js'),
    assert = require('assert'),
    config = require('./config.js'),
    certificates = require('./certificates.js'),
    debug = require('debug')('box:platform'),
    fs = require('fs'),
    ini = require('ini'),
    path = require('path'),
    paths = require('./paths.js'),
    shell = require('./shell.js');

var SETUP_INFRA_CMD = path.join(__dirname, 'scripts/setup_infra.sh');

function initialize(callback) {
    if (process.env.BOX_ENV === 'test' && !process.env.CREATE_INFRA) return callback();

    debug('initializing addon infrastructure');

    var currentInfraData = fs.readFileSync(__dirname + '/INFRA_VERSION', 'utf8');
    var currentInfra = ini.parse(currentInfraData);
    var existingInfra = { INFRA_VERSION: 'none' };
    if (fs.existsSync(paths.INFRA_VERSION_FILE)) {
        existingInfra = ini.parse(fs.readFileSync(paths.INFRA_VERSION_FILE, 'utf8'));
    }

    if (currentInfra.INFRA_VERSION === existingInfra.INFRA_VERSION) {
        debug('platform is uptodate at version %s', currentInfra.INFRA_VERSION);
        return callback();
    }

    debug('Updating infrastructure from %s to %s', existingInfra.INFRA_VERSION, currentInfra.INFRA_VERSION);

    stopContainersSync();

    if (!existingInfra.INFRA_VERSION) removeImagesSync(); // a hack for --recreate-infra

    startAddons(function (error) {
        if (error) return callback(error);

        var func = existingInfra ? apps.configureInstalledApps : apps.restoreInstalledApps;

        func(function (error) {
            if (error) return callback(error);

            fs.writeFileSync(paths.INFRA_VERSION_FILE, currentInfraData);

            callback();
        });
    });
}

function removeImagesSync() {
    debug('removing existing images');
    shell.execSync('removeImagesSync', 'docker images -q | xargs --no-run-if-empty docker rmi -f');
}

function stopContainersSync() {
    // TODO: be nice and stop addons cleanly (example, shutdown commands)
    debug('stopping existing containers');
    shell.execSync('stopContainersSync', 'docker ps -qa | xargs --no-run-if-empty docker rm -f');
}

function startAddons(callback) {
    assert.strictEqual(typeof callback, 'function');

    certificates.getAdminCertificatePath(function (error, certFilePath, keyFilePath) {
        if (error) return callback(error);

        shell.sudo('seutp_infra', [ SETUP_INFRA_CMD, paths.DATA_DIR, config.fqdn(), config.adminFqdn(), certFilePath, keyFilePath ], function (error) {
            callback(error);
        });
    });
}
