/* jslint node: true */

'use strict';

var path = require('path'),
    os = require('os'),
    safe = require('safetydance'),
    crypto = require('crypto'),
    assert = require('assert'),
    mkdirp = require('mkdirp');

function getUserHomeDir() {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
}

var production = process.env.NODE_ENV === 'production';
var config = { };

if (production) {
    config.baseDir =  path.join(getUserHomeDir(), '.yellowtent');
} else {
    config.baseDir = process.env.BASE_DIR || path.resolve(os.tmpdir(), 'test-' + crypto.randomBytes(4).readUInt32LE(0));
    process.env.BASE_DIR = config.baseDir; // pass on base dir to child processes
}

config.cloudronConfigFile = path.join(config.baseDir, 'cloudron.conf');

config.save = function () {
    safe.fs.writeFileSync(config.cloudronConfigFile, JSON.stringify(config)); // functions are ignored by JSON.stringify
};

(function initConfig() {
    if (safe.fs.existsSync(config.cloudronConfigFile)) {
        var data = safe.JSON.parse(safe.fs.readFileSync(config.cloudronConfigFile, 'utf8'));
        for (var key in data) config[key] = data[key];
        return;
    }

    // setup defaults
    if (production) {
        config.port = 3000;
        config.logApiRequests = true;
        config.appServerUrl = process.env.APP_SERVER_URL || 'https://selfhost.io:5050'; // APP_SERVER_URL is set during bootstrap in the box's supervisor manifest
    } else {
        config.port = 5454;
        config.logApiRequests = false;
        config.appServerUrl = 'http://localhost:6060'; // hock doesn't support https
    }

    config.nginxConfigDir = path.join(config.baseDir, 'nginx');
    config.appDataRoot = path.join(config.baseDir, 'appdata');
    config.configRoot = path.join(config.baseDir, 'config');
    config.dataRoot = path.join(config.baseDir, 'data');
    config.mountRoot = path.join(config.baseDir, 'mount');

    config.nginxAppConfigDir = path.join(config.nginxConfigDir, 'applications');
    config.nginxCertDir = path.join(config.nginxConfigDir, 'cert');

    config.fqdn = 'localhost';
    config.adminOrigin = 'https://admin-' + config.fqdn;

    config.token = null;
    config.nakedDomain = null;
    config.ip = null;
    config.version = '0';
    config.aws = null;

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

