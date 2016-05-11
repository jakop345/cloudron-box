'use strict';

exports = module.exports = {
    baseDir: baseDir,

    // values set here will be lost after a upgrade/update. use the sqlite database
    // for persistent values that need to be backed up
    get: get,
    set: set,

    // ifdefs to check environment
    CLOUDRON: process.env.BOX_ENV === 'cloudron',
    TEST: process.env.BOX_ENV === 'test',

    // convenience getters
    provider: provider,
    apiServerOrigin: apiServerOrigin,
    webServerOrigin: webServerOrigin,
    fqdn: fqdn,
    token: token,
    version: version,
    setVersion: setVersion,
    isCustomDomain: isCustomDomain,
    database: database,

    // these values are derived
    adminOrigin: adminOrigin,
    internalAdminOrigin: internalAdminOrigin,
    sysadminOrigin: sysadminOrigin, // caas routes
    adminFqdn: adminFqdn,
    mailFqdn: mailFqdn,
    appFqdn: appFqdn,
    zoneName: zoneName,
    adminEmail: adminEmail,

    isDev: isDev,

    // for testing resets to defaults
    _reset: _reset
};

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

function _reset (callback) {
    safe.fs.unlinkSync(cloudronConfigFileName);

    initConfig();

    if (callback) callback();
}

function initConfig() {
    // setup defaults
    data.fqdn = 'localhost';

    data.token = null;
    data.adminEmail = null;
    data.boxVersionsUrl = null;
    data.version = null;
    data.isCustomDomain = false;
    data.webServerOrigin = null;
    data.sysadminPort = 3001;
    data.ldapPort = 3002;
    data.oauthProxyPort = 3003;
    data.simpleAuthPort = 3004;
    data.provider = 'caas';
    data.appBundle = [ ];

    if (exports.CLOUDRON) {
        data.port = 3000;
        data.apiServerOrigin = null;
        data.database = null;
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
        data.adminEmail = 'test@cloudron.foo';
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

// cleanup any old config file we have for tests
if (exports.TEST) safe.fs.unlinkSync(cloudronConfigFileName);

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

function adminEmail() {
    return get('adminEmail');
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

function adminFqdn() {
    return appFqdn(constants.ADMIN_LOCATION);
}

function mailFqdn() {
    return appFqdn(constants.MAIL_LOCATION);
}

function adminOrigin() {
    return 'https://' + appFqdn(constants.ADMIN_LOCATION);
}

function internalAdminOrigin() {
    return 'http://127.0.0.1:' + get('port');
}

function sysadminOrigin() {
    return 'http://127.0.0.1:' + get('sysadminPort');
}

function token() {
    return get('token');
}

function version() {
    return get('version');
}

function setVersion(version) {
    set('version', version);
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

function isDev() {
    return /dev/i.test(get('boxVersionsUrl'));
}

function provider() {
    return get('provider');
}
