/* jslint node: true */

'use strict';

var path = require('path'),
    fs = require('fs'),
    safe = require('safetydance'),
    assert = require('assert'),
    _ = require('underscore'),
    path = require('path'),
    mkdirp = require('mkdirp');

var homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
var production = process.env.NODE_ENV === 'production';

var config = { };

config.baseDir = function () {
   return production
        ? path.join(homeDir, process.env.CLOUDRON === '1' ? '' : '.yellowtent')
        : path.join(homeDir, '.yellowtenttest');
};

var cloudronConfigFileName = path.join(config.baseDir(), 'configs/cloudron.conf');

config.save = function () {
    fs.writeFileSync(cloudronConfigFileName, JSON.stringify(config, null, 4)); // functions are ignored by JSON.stringify
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

    config.fqdn = 'localhost';
    config.adminOrigin = 'https://admin-' + config.fqdn;

    config.token = null;
    config.mailServer = null;
    config.mailUsername = null;
    config.mailDnsRecordIds = [ ];

    if (safe.fs.existsSync(cloudronConfigFileName)) {
        var data = safe.JSON.parse(safe.fs.readFileSync(cloudronConfigFileName, 'utf8'));
        _.extend(config, data); // overwrite defaults with saved config
        return;
    }

    mkdirp.sync(path.dirname(cloudronConfigFileName));
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

config.get = function (key) {
    assert(typeof key === 'string');

    return config[key];
};

config.version = function () {
    return require('./package.json').version;
};

exports = module.exports = config;

