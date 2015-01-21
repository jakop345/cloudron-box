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

    // ifdefs to check environment
    CLOUDRON: process.env.NODE_ENV === 'cloudron',
    TEST: process.env.NODE_ENV === 'test',
    LOCAL: process.env.NODE_ENV === 'local' || !process.env.NODE_ENV,

    // convenience getters
    appServerUrl: appServerUrl,
    fqdn: fqdn,
    adminOrigin: adminOrigin,
    token: token
};

var homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

var data = { };

function baseDir() {
    if (exports.CLOUDRON) return homeDir;
    if (exports.TEST) return path.join(homeDir, '.yellowtenttest');
    if (exports.LOCAL) return path.join(homeDir, '.yellowtent');
}

var cloudronConfigFileName = path.join(baseDir(), 'configs/cloudron.conf');

function saveSync() {
    fs.writeFileSync(cloudronConfigFileName, JSON.stringify(data, null, 4)); // functions are ignored by JSON.stringify
}

(function initConfig() {
    // setup defaults
    if (exports.CLOUDRON) {
        data.port = 3000;
        data.appServerUrl = process.env.APP_SERVER_URL || null; // APP_SERVER_URL is set during bootstrap in the box's supervisor manifest
    } else if (exports.TEST) {
        data.port = 5454;
        data.appServerUrl = 'http://localhost:6060'; // hock doesn't support https
    } else if (exports.LOCAL) {
        data.port = 3000;
        data.appServerUrl = 'http://localhost:5050';
    } else {
        assert(false, 'Unknown environment. This should not happen!');
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

