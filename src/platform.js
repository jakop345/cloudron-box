'use strict';

exports = module.exports = {
    initialize: initialize,

    mailConfig: mailConfig
};

var apps = require('./apps.js'),
    assert = require('assert'),
    config = require('./config.js'),
    certificates = require('./certificates.js'),
    debug = require('debug')('box:platform'),
    fs = require('fs'),
    infra = require('./infra_version.js'),
    ini = require('ini'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js'),
    util = require('util');

var SETUP_INFRA_CMD = path.join(__dirname, 'scripts/setup_infra.sh');

var gAddonVars = null;

function initialize(callback) {
    if (process.env.BOX_ENV === 'test' && !process.env.CREATE_INFRA) return callback();

    debug('initializing addon infrastructure');

    var existingInfra = { version: 'none' };
    if (fs.existsSync(paths.INFRA_VERSION_FILE)) {
        existingInfra = safe.JSON.parse(fs.readFileSync(paths.INFRA_VERSION_FILE, 'utf8'));
        if (!existingInfra) existingInfra = { version: 'legacy' };
    }

    if (infra.version === existingInfra.version) {
        debug('platform is uptodate at version %s', infra.version);
        return callback();
    }

    debug('Updating infrastructure from %s to %s', existingInfra.version, infra.version);

    stopContainersSync();

    startAddons(function (error) {
        if (error) return callback(error);

        removeOldImagesSync();

        var func = existingInfra ? apps.configureInstalledApps : apps.restoreInstalledApps;

        func(function (error) {
            if (error) return callback(error);

            fs.writeFileSync(paths.INFRA_VERSION_FILE, JSON.stringify(infra));

            loadAddonVarsSync();

            callback();
        });
    });
}

function removeOldImagesSync() {
    debug('removing old addon images');

    for (var imageName in infra.images) {
        var image = infra.images[imageName];
        debug('cleaning up images of %s', image);
        var cmd = 'docker images "%s" | tail -n +2 | awk \'{ print $1 ":" $2 }\' | grep -v "%s" | xargs --no-run-if-empty docker rmi';
        shell.execSync('removeOldImagesSync', util.format(cmd, image.repo, image.tag));
    }
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

function loadAddonVarsSync() {
    gAddonVars = {
        mail: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/mail_vars.sh', 'utf8')),
        postgresql: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/postgresql_vars.sh', 'utf8')),
        mysql: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/mysql_vars.sh', 'utf8')),
        mongodb: ini.parse(fs.readFileSync(paths.DATA_DIR + '/addons/mongodb_vars.sh', 'utf8'))
    };
}

function mailConfig() {
    if (!gAddonVars) return { username: 'no-reply', from: 'no-reply@' + config.fqdn(), password: 'doesnotwork' }; // for tests which don't run infra

    return {
        username: gAddonVars.mail.MAIL_ROOT_USERNAME,
        from: '"Cloudron" <' + gAddonVars.mail.MAIL_ROOT_USERNAME + '@' + config.fqdn() + '>',
        password: gAddonVars.mail.MAIL_ROOT_PASSWORD
    };
}
