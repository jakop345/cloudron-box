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

var data = { };

config.baseDir = function () {
   return production
        ? path.join(homeDir, process.env.CLOUDRON === '1' ? '' : '.yellowtent')
        : path.join(homeDir, '.yellowtenttest');
};

var cloudronConfigFileName = path.join(config.baseDir(), 'configs/cloudron.conf');

config.saveSync = function () {
    fs.writeFileSync(cloudronConfigFileName, JSON.stringify(data, null, 4)); // functions are ignored by JSON.stringify
};

(function initConfig() {
    // setup defaults
    if (production) {
        data.port = 3000;
        data.logApiRequests = true;
        data.appServerUrl = process.env.APP_SERVER_URL || null; // APP_SERVER_URL is set during bootstrap in the box's supervisor manifest
        data.isDev = false;
    } else {
        data.port = 5454;
        data.logApiRequests = false;
        data.appServerUrl = 'http://localhost:6060'; // hock doesn't support https
        data.isDev = true;
    }

    data.fqdn = 'localhost';
    data.adminOrigin = 'https://admin-' + config.fqdn;

    data.token = null;
    data.mailServer = null;
    data.mailUsername = null;
    data.mailDnsRecordIds = [ ];

    if (safe.fs.existsSync(cloudronConfigFileName)) {
        var existingData = safe.JSON.parse(safe.fs.readFileSync(cloudronConfigFileName, 'utf8'));
        _.extend(data, existingData); // overwrite defaults with saved config
        return;
    }

    mkdirp.sync(path.dirname(cloudronConfigFileName));
    config.saveSync();
})();

// config.set(obj) or config.set(key, value)
config.set = function (key, value) {
    if (typeof key === 'object') {
        var obj = key;
        for (var k in obj) {
            assert(k in data, 'config.js is missing key "' + k + '"');
            data[k] = obj[k];
        }
    } else {
        assert(key in data, 'config.js is missing key "' + key + '"');
        data[key] = value;
    }
    config.saveSync();
};

config.get = function (key) {
    assert(typeof key === 'string');
    assert(key in data);

    return data[key];
};

config.version = function () {
    return require('./package.json').version;
};

config.appServerUrl = function () {
    return config.get('appServerUrl');
};

config.fqdn = function () {
    return config.get('fqdn');
};

config.adminOrigin = function () {
    return config.get('adminOrigin');
};

config.token = function () {
    return config.get('token');
};

exports = module.exports = config;

