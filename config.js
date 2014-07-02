/* jslint node: true */

'use strict';

var path = require('path'),
    os = require('os'),
    assert = require('assert');

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

// load provisioned config file if there
var configFile;
try {
    configFile = require('/etc/yellowtent.json');
} catch (e) {
    // TODO: instead of requiring env variable, use the output of hostname -f
    assert(typeof process.env.FQDN !== 'undefined', 'Set FQDN to the box domain name');

    console.log('Unable to load provisioned config file. Using defaults.');
    configFile = {
        token: null,
        appstoreOrigin: 'https://selfhost.io:5050',
        adminOrigin: 'https://admin.' + process.env.FQDN,
        fqdn: process.env.FQDN
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

