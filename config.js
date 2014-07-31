/* jslint node: true */

'use strict';

var path = require('path'),
    os = require('os');

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var baseDir = path.join(getUserHomeDir(), '.yellowtent');

var appDataRoot = path.join(baseDir, 'appdata');
var configRoot = path.join(baseDir, 'config');
var dataRoot = path.join(baseDir, 'data');
var mountRoot = path.join(baseDir, 'mount');
var port = 3000;
var silent = false;
var nginxAppConfigDir = path.join(__dirname, 'nginx/applications/');
var fqdn = os.hostname();
var appstoreOrigin = 'https://selfhost.io:5050';

// load provisioned config file if there
var configFile;
try {
    configFile = require('/etc/yellowtent.json');
    if (!configFile.appstoreOrigin) throw('No appstoreOrigin found in yellowtent.json');
    appstoreOrigin = configFile.appstoreOrigin;
} catch (e) {
    // TODO: instead of requiring env variable, use the output of hostname -f
    if (typeof process.env.FQDN !== 'undefined') fqdn = process.env.FQDN;

    console.error('Unable to load provisioned config file. Using defaults.', e);
}

exports = module.exports = {
    port: port,
    dataRoot: dataRoot,
    configRoot: configRoot,
    mountRoot: mountRoot,
    silent: silent,
    token: null,
    appServerUrl: appstoreOrigin,
    adminOrigin: 'https://admin-' + fqdn,
    nginxAppConfigDir: nginxAppConfigDir,
    appDataRoot: appDataRoot,
    fqdn: fqdn
};

