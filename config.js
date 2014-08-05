/* jslint node: true */

'use strict';

var path = require('path'),
    os = require('os'),
    crypto = require('crypto');

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var config = { };

var production = process.env.NODE_ENV === 'production';

if (production) {
    config.baseDir =  path.join(getUserHomeDir(), '.yellowtent');
    config.nginxConfigDir = path.join(__dirname, 'nginx'); // FIXME: this should be based off baseDir as well
    config.port = 3000;
    config.logApiRequests = true;
    config.appServerUrl = process.env.APP_SERVER_URL || 'https://selfhost.io:5050'; // APP_SERVER_URL is set during bootstrap in the box's supervisor manifest
    config.token = null; // initialized through settingsdb on server start
} else {
    config.baseDir = process.env.BASE_DIR || path.resolve(os.tmpdir(), 'test-' + crypto.randomBytes(4).readUInt32LE(0));
    process.env.BASE_DIR = config.baseDir; // BASE_DIR is set for use in child processes (apptask, apphealthtask)
    config.nginxConfigDir = path.join(config.baseDir, 'nginx');
    config.port = 5454;
    config.logApiRequests = false;
    config.appServerUrl = 'http://localhost:6060'; // hock doesn't support https
    config.token = process.env.APPSTORE_TOKEN || null;
}

config.appDataRoot = path.join(config.baseDir, 'appdata');
config.configRoot = path.join(config.baseDir, 'config');
config.dataRoot = path.join(config.baseDir, 'data');
config.mountRoot = path.join(config.baseDir, 'mount');

config.nginxAppConfigDir = path.join(config.nginxConfigDir, 'applications');

config.fqdn = process.env.FQDN || os.hostname();
config.adminOrigin = 'https://admin-' + config.fqdn;

exports = module.exports = config;

