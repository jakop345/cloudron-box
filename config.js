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

// load provisioned config file if there
var configFile;
try {
    configFile = require('/etc/yellowtent.json');
} catch (e) {
    // TODO: instead of requiring env variable, use the output of hostname -f
    if (typeof process.env.FQDN !== 'undefined') fqdn = process.env.FQDN;

    console.log('Unable to load provisioned config file. Using defaults.');

    configFile = {
        token: null,
        appstoreOrigin: 'https://selfhost.io:5050',
        adminOrigin: 'https://admin.' + fqdn,
        fqdn: fqdn
    };
}

exports = module.exports = {
    port: port,
    dataRoot: dataRoot,
    configRoot: configRoot,
    mountRoot: mountRoot,
    silent: silent,
    token: configFile.token,
    appServerUrl: configFile.appstoreOrigin,
    adminOrigin: configFile.adminOrigin,
    nginxAppConfigDir: nginxAppConfigDir,
    appDataRoot: appDataRoot,
    fqdn: configFile.fqdn
};

