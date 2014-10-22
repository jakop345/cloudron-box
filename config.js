/* jslint node: true */

'use strict';

var path = require('path'),
    os = require('os'),
    fs = require('fs'),
    safe = require('safetydance'),
    crypto = require('crypto'),
    assert = require('assert'),
    _ = require('underscore'),
    mkdirp = require('mkdirp');

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var production = process.env.NODE_ENV === 'production';
var config = { };

if (production) {
    config.baseDir =  path.join(getUserHomeDir(), process.env.CLOUDRON === '1' ? 'data' : '.yellowtent');
} else {
    config.baseDir = path.join(getUserHomeDir(), '.yellowtenttest');
}

config.cloudronConfigFile = path.join(config.baseDir, 'cloudron.conf');

config.save = function () {
    fs.writeFileSync(config.cloudronConfigFile, JSON.stringify(config, null, 4)); // functions are ignored by JSON.stringify
};

(function initConfig() {
    // setup defaults
    if (production) {
        config.port = 3000;
        config.logApiRequests = true;
        config.appServerUrl = process.env.APP_SERVER_URL || null; // APP_SERVER_URL is set during bootstrap in the box's supervisor manifest
        config.isDev = false;
    } else {
        config.port = 5454;
        config.logApiRequests = false;
        config.appServerUrl = 'http://localhost:6060'; // hock doesn't support https
        config.isDev = true;
    }

    config.nginxConfigDir = path.join(config.baseDir, 'nginx');
    config.harakaConfigDir = path.join(config.baseDir, 'haraka');
    config.appDataRoot = path.join(config.baseDir, 'appdata');
    config.dataRoot = path.join(config.baseDir, 'data'); // TODO: rename to volumesRoot
    config.iconsRoot = path.join(config.baseDir, 'icons');
    config.mountRoot = path.join(config.baseDir, 'mount');
    config.collectdAppConfigDir = path.join(config.baseDir, 'collectd/collectd.conf.d');

    config.nginxAppConfigDir = path.join(config.nginxConfigDir, 'applications');
    config.nginxCertDir = path.join(config.nginxConfigDir, 'cert');

    config.fqdn = 'localhost';
    config.adminOrigin = 'https://admin-' + config.fqdn;

    config.token = null;
    config.nakedDomain = null;
    config.version = '0.5.0';
    config.mailServer = null;
    config.mailUsername = null;

    if (safe.fs.existsSync(config.cloudronConfigFile)) {
        var data = safe.JSON.parse(safe.fs.readFileSync(config.cloudronConfigFile, 'utf8'));
        _.extend(config, data); // overwrite defaults with saved config
        return;
    }

    mkdirp.sync(config.baseDir);
    config.save();
})();

// config.set(obj) or config.set(key, value)
config.set = function (key, value) {
    if (typeof key === 'object') {
        var obj = key;
        for (var k in obj) {
            assert(k in config, 'config.js is missing key "' + k + '"');
            assert(k !== 'set' && k !== 'save', 'setting reserved key');
            config[k] = obj[k];
        }
    } else {
        assert(key in config, 'config.js is missing key "' + key + '"');
        assert(key !== 'set' && key !== 'save', 'setting reserved key');
        config[key] = value;
    }
    config.save();
};

exports = module.exports = config;

