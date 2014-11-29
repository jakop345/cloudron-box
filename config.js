/* jslint node: true */

'use strict';

var path = require('path'),
    fs = require('fs'),
    safe = require('safetydance'),
    assert = require('assert'),
    _ = require('underscore'),
    path = require('path'),
    mkdirp = require('mkdirp');

exports = module.exports = {
    baseDir: baseDir,
    get: get,
    set: set,

    // convenience getters
    version: version,
    appServerUrl: appServerUrl,
    fqdn: fqdn,
    adminOrigin: adminOrigin,
    token: token
};

var homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
var production = process.env.NODE_ENV === 'production';

var data = { };

function baseDir() {
   return production
        ? path.join(homeDir, process.env.CLOUDRON === '1' ? '' : '.yellowtent')
        : path.join(homeDir, '.yellowtenttest');
}

var cloudronConfigFileName = path.join(baseDir(), 'configs/cloudron.conf');

function saveSync() {
    fs.writeFileSync(cloudronConfigFileName, JSON.stringify(data, null, 4)); // functions are ignored by JSON.stringify
};

(function initConfig() {
    // setup defaults
    if (production) {
        data.port = 3000;
        data.appServerUrl = process.env.APP_SERVER_URL || null; // APP_SERVER_URL is set during bootstrap in the box's supervisor manifest
    } else {
        data.port = 5454;
        data.appServerUrl = 'http://localhost:6060'; // hock doesn't support https
    }

    data.fqdn = 'localhost';

    data.token = null;
    data.mailServer = null;
    data.mailUsername = null;
    data.mailDnsRecordIds = [ ];
    data.boxVersionsUrl = null;

    if (safe.fs.existsSync(cloudronConfigFileName)) {
        var existingData = safe.JSON.parse(safe.fs.readFileSync(cloudronConfigFileName, 'utf8'));
        _.extend(data, existingData); // overwrite defaults with saved config
        return;
    }

    mkdirp.sync(path.dirname(cloudronConfigFileName));
    saveSync();
})();

// set(obj) or set(key, value)
function set(key, value) {
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
    saveSync();
}

function get(key) {
    assert(typeof key === 'string');

    return safe.query(data, key);
}

function version() {
    return require('./package.json').version;
}

function appServerUrl() {
    return get('appServerUrl');
}

function fqdn() {
    return get('fqdn');
}

function adminOrigin() {
    return 'https://admin-' + fqdn();
}

function token() {
    return get('token');
}

