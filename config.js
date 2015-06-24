/* jslint node: true */

'use strict';


exports.baseDir = baseDir;

// values set here will be lost after a upgrade/update. use the sqlite database
// for persistent values that need to be backed up
exports.get = get;
exports.set = set;

// ifdefs to check environment
exports.CLOUDRON = process.env.NODE_ENV === 'cloudron';
exports.TEST = process.env.NODE_ENV === 'test';

// convenience getters
exports.apiServerOrigin = apiServerOrigin;
exports.webServerOrigin = webServerOrigin;
exports.fqdn = fqdn;
exports.token = token;
exports.version = version;
exports.isCustomDomain = isCustomDomain;
exports.database = database;
exports.developerMode = developerMode;

// these values are derived
exports.adminOrigin = adminOrigin;
exports.appFqdn = appFqdn;
exports.zoneName = zoneName;

// for testing resets to defaults
exports._reset = initConfig;


var assert = require('assert'),
    constants = require('./constants.js'),
    fs = require('fs'),
    path = require('path'),
    safe = require('safetydance'),
    _ = require('underscore');

var homeDir = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

var data = { };

function baseDir() {
    if (exports.CLOUDRON) return homeDir;
    if (exports.TEST) return path.join(homeDir, '.cloudron_test');
}

var cloudronConfigFileName = path.join(baseDir(), 'configs/cloudron.conf');

function saveSync() {
    fs.writeFileSync(cloudronConfigFileName, JSON.stringify(data, null, 4)); // functions are ignored by JSON.stringify
}

function initConfig() {
    // setup defaults
    data.fqdn = 'localhost';

    data.token = null;
    data.mailServer = null;
    data.mailUsername = null;
    data.mailDnsRecordIds = [ ];
    data.boxVersionsUrl = null;
    data.version = null;
    data.isCustomDomain = false;
    data.webServerOrigin = null;
    data.internalPort = 3001;
    data.ldapPort = 3002;

    if (exports.CLOUDRON) {
        data.port = 3000;
        data.apiServerOrigin = null;
        data.database = null;
        data.developerMode = false;
    } else if (exports.TEST) {
        data.port = 5454;
        data.apiServerOrigin = 'http://localhost:6060'; // hock doesn't support https
        data.database = {
            hostname: 'localhost',
            username: 'root',
            password: '',
            port: 3306,
            name: 'boxtest'
        };
        data.token = 'APPSTORE_TOKEN';
        data.developerMode = false;
    } else {
        assert(false, 'Unknown environment. This should not happen!');
    }

    if (safe.fs.existsSync(cloudronConfigFileName)) {
        var existingData = safe.JSON.parse(safe.fs.readFileSync(cloudronConfigFileName, 'utf8'));
        _.extend(data, existingData); // overwrite defaults with saved config
        return;
    }

    saveSync();
}

initConfig();

// set(obj) or set(key, value)
function set(key, value) {
    if (typeof key === 'object') {
        var obj = key;
        for (var k in obj) {
            assert(k in data, 'config.js is missing key "' + k + '"');
            data[k] = obj[k];
        }
    } else {
        data = safe.set(data, key, value);
    }
    saveSync();
}

function get(key) {
    assert.strictEqual(typeof key, 'string');

    return safe.query(data, key);
}

function apiServerOrigin() {
    return get('apiServerOrigin');
}

function webServerOrigin() {
    return get('webServerOrigin');
}

function fqdn() {
    return get('fqdn');
}

// keep this in sync with start.sh admin.conf generation code
function appFqdn(location) {
    assert.strictEqual(typeof location, 'string');

    if (location === '') return fqdn();
    return isCustomDomain() ? location + '.' + fqdn() : location + '-' + fqdn();
}

function adminOrigin() {
    return 'https://' + appFqdn(constants.ADMIN_LOCATION);
}

function token() {
    return get('token');
}

function version() {
    return get('version');
}

function isCustomDomain() {
    return get('isCustomDomain');
}

function zoneName() {
    if (isCustomDomain()) return fqdn(); // the appstore sets up the custom domain as a zone

    // for shared domain name, strip out the hostname
    return fqdn().substr(fqdn().indexOf('.') + 1);
}

function database() {
    return get('database');
}

function developerMode() {
    return get('developerMode');
}

