/* jslint node: true */

'use strict';

var path = require('path'),
    os = require('os'),
    safe = require('safetydance'),
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
var nginxConfigDir = path.join(__dirname, 'nginx');
var nginxAppConfigDir = path.join(nginxConfigDir, 'applications');
var fqdn = process.env.FQDN || os.hostname();
var appstoreOrigin = 'https://selfhost.io:5050';

// load provisioned config file if there
var configFile = safe.JSON.parse(safe.fs.readFileSync('/etc/yellowtent.json'));
if (configFile !== null) {
    assert(configFile.appstoreOrigin, 'No appstoreOrigin found in yellowtent.json');
    appstoreOrigin = configFile.appstoreOrigin;
} else {
    console.error('Unable to load provisioned config file. Using defaults.');
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
    nginxConfigDir: nginxConfigDir,
    nginxAppConfigDir: nginxAppConfigDir,
    appDataRoot: appDataRoot,
    fqdn: fqdn
};

