/* jslint node:true */

'use strict';

exports = module.exports = {
    SettingsError: SettingsError,

    getAutoupdatePattern: getAutoupdatePattern,
    setAutoupdatePattern: setAutoupdatePattern,

    getTimeZone: getTimeZone,
    setTimeZone: setTimeZone,

    getCloudronName: getCloudronName,
    setCloudronName: setCloudronName,

    getCloudronAvatar: getCloudronAvatar,
    setCloudronAvatar: setCloudronAvatar,

    getDeveloperMode: getDeveloperMode,
    setDeveloperMode: setDeveloperMode,

    getDnsConfig: getDnsConfig,
    setDnsConfig: setDnsConfig,

    getBackupConfig: getBackupConfig,
    setBackupConfig: setBackupConfig,

    getTlsConfig: getTlsConfig,
    setTlsConfig: setTlsConfig,

    getUpdateConfig: getUpdateConfig,
    setUpdateConfig: setUpdateConfig,

    getDefaultSync: getDefaultSync,
    getAll: getAll,

    AUTOUPDATE_PATTERN_KEY: 'autoupdate_pattern',
    TIME_ZONE_KEY: 'time_zone',
    CLOUDRON_NAME_KEY: 'cloudron_name',
    DEVELOPER_MODE_KEY: 'developer_mode',
    DNS_CONFIG_KEY: 'dns_config',
    BACKUP_CONFIG_KEY: 'backup_config',
    TLS_CONFIG_KEY: 'tls_config',
    UPDATE_CONFIG_KEY: 'update_config',

    events: new (require('events').EventEmitter)()
};

var assert = require('assert'),
    config = require('./config.js'),
    CronJob = require('cron').CronJob,
    DatabaseError = require('./databaseerror.js'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    settingsdb = require('./settingsdb.js'),
    util = require('util'),
    _ = require('underscore');

var gDefaults = (function () {
    var result = { };
    result[exports.AUTOUPDATE_PATTERN_KEY] = '00 00 1,3,5,23 * * *';
    result[exports.TIME_ZONE_KEY] = 'America/Los_Angeles';
    result[exports.CLOUDRON_NAME_KEY] = 'Cloudron';
    result[exports.DEVELOPER_MODE_KEY] = false;
    result[exports.DNS_CONFIG_KEY] = { };
    result[exports.BACKUP_CONFIG_KEY] = { };
    result[exports.TLS_CONFIG_KEY] = { provider: 'caas' };
    result[exports.UPDATE_CONFIG_KEY] = { prerelease: false };

    return result;
})();

if (config.TEST) {
    // avoid noisy warnings during npm test
    exports.events.setMaxListeners(100);
}

function SettingsError(reason, errorOrMessage) {
    assert.strictEqual(typeof reason, 'string');
    assert(errorOrMessage instanceof Error || typeof errorOrMessage === 'string' || typeof errorOrMessage === 'undefined');

    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.reason = reason;
    if (typeof errorOrMessage === 'undefined') {
        this.message = reason;
    } else if (typeof errorOrMessage === 'string') {
        this.message = errorOrMessage;
    } else {
        this.message = 'Internal error';
        this.nestedError = errorOrMessage;
    }
}
util.inherits(SettingsError, Error);
SettingsError.INTERNAL_ERROR = 'Internal Error';
SettingsError.NOT_FOUND = 'Not Found';
SettingsError.BAD_FIELD = 'Bad Field';

function setAutoupdatePattern(pattern, callback) {
    assert.strictEqual(typeof pattern, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (pattern !== 'never') { // check if pattern is valid
        var job = safe.safeCall(function () { return new CronJob(pattern); });
        if (!job) return callback(new SettingsError(SettingsError.BAD_FIELD, 'Invalid pattern'));
    }

    settingsdb.set(exports.AUTOUPDATE_PATTERN_KEY, pattern, function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.AUTOUPDATE_PATTERN_KEY, pattern);

        return callback(null);
    });
}

function getAutoupdatePattern(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.AUTOUPDATE_PATTERN_KEY, function (error, pattern) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.AUTOUPDATE_PATTERN_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, pattern);
    });
}

function setTimeZone(tz, callback) {
    assert.strictEqual(typeof tz, 'string');
    assert.strictEqual(typeof callback, 'function');

    settingsdb.set(exports.TIME_ZONE_KEY, tz, function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.TIME_ZONE_KEY, tz);

        return callback(null);
    });
}

function getTimeZone(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.TIME_ZONE_KEY, function (error, tz) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.TIME_ZONE_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, tz);
    });
}

function getCloudronName(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.CLOUDRON_NAME_KEY, function (error, name) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.CLOUDRON_NAME_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));
        callback(null, name);
    });
}

function setCloudronName(name, callback) {
    assert.strictEqual(typeof name, 'string');
    assert.strictEqual(typeof callback, 'function');

    if (!name) return callback(new SettingsError(SettingsError.BAD_FIELD));

    settingsdb.set(exports.CLOUDRON_NAME_KEY, name, function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.CLOUDRON_NAME_KEY, name);

        return callback(null);
    });
}

function getCloudronAvatar(callback) {
    assert.strictEqual(typeof callback, 'function');

    var avatar = safe.fs.readFileSync(paths.CLOUDRON_AVATAR_FILE);
    if (avatar) return callback(null, avatar);

    // try default fallback
    avatar = safe.fs.readFileSync(paths.CLOUDRON_DEFAULT_AVATAR_FILE);
    if (avatar) return callback(null, avatar);

    callback(new SettingsError(SettingsError.INTERNAL_ERROR, safe.error));
}

function setCloudronAvatar(avatar, callback) {
    assert(util.isBuffer(avatar));
    assert.strictEqual(typeof callback, 'function');

    if (!safe.fs.writeFileSync(paths.CLOUDRON_AVATAR_FILE, avatar)) {
        return callback(new SettingsError(SettingsError.INTERNAL_ERROR, safe.error));
    }

    return callback(null);
}

function getDeveloperMode(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.DEVELOPER_MODE_KEY, function (error, enabled) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.DEVELOPER_MODE_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        // settingsdb holds string values only
        callback(null, !!enabled);
    });
}

function setDeveloperMode(enabled, callback) {
    assert.strictEqual(typeof enabled, 'boolean');
    assert.strictEqual(typeof callback, 'function');

    // settingsdb takes string values only
    settingsdb.set(exports.DEVELOPER_MODE_KEY, enabled ? 'enabled' : '', function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.DEVELOPER_MODE_KEY, enabled);

        return callback(null);
    });
}

function getDnsConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.DNS_CONFIG_KEY, function (error, value) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.DNS_CONFIG_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, JSON.parse(value)); // accessKeyId, secretAccessKey, region
    });
}

function setDnsConfig(dnsConfig, callback) {
    assert.strictEqual(typeof dnsConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    var credentials;

    if (dnsConfig.provider === 'route53') {
        if (typeof dnsConfig.accessKeyId !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'accessKeyId must be a string'));
        if (typeof dnsConfig.secretAccessKey !== 'string') return callback(new SettingsError(SettingsError.BAD_FIELD, 'secretAccessKey must be a string'));

        credentials = {
            provider: dnsConfig.provider,
            accessKeyId: dnsConfig.accessKeyId,
            secretAccessKey: dnsConfig.secretAccessKey,
            region: dnsConfig.region || 'us-east-1',
            endpoint: dnsConfig.endpoint || null
        };
    } else if (dnsConfig.provider === 'caas') {
        credentials = {
            provider: dnsConfig.provider
        };
    } else {
        return callback(new SettingsError(SettingsError.BAD_FIELD, 'provider must be route53 or caas'));
    }

    settingsdb.set(exports.DNS_CONFIG_KEY, JSON.stringify(credentials), function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.DNS_CONFIG_KEY, dnsConfig);

        callback(null);
    });
}

function getTlsConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.TLS_CONFIG_KEY, function (error, value) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.TLS_CONFIG_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, JSON.parse(value)); // provider
    });
}

function setTlsConfig(tlsConfig, callback) {
    assert.strictEqual(typeof tlsConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (tlsConfig.provider !== 'caas' && tlsConfig.provider.indexOf('le-') !== 0) {
        return callback(new SettingsError(SettingsError.BAD_FIELD, 'provider must be caas or le-*'));
    }

    settingsdb.set(exports.TLS_CONFIG_KEY, JSON.stringify(tlsConfig), function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.TLS_CONFIG_KEY, tlsConfig);

        callback(null);
    });
}

function getBackupConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.BACKUP_CONFIG_KEY, function (error, value) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.BACKUP_CONFIG_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, JSON.parse(value)); // provider, token, key, region, prefix, bucket
    });
}

function setBackupConfig(backupConfig, callback) {
    assert.strictEqual(typeof backupConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    if (backupConfig.provider !== 'caas') {
        return callback(new SettingsError(SettingsError.BAD_FIELD, 'provider must be caas'));
    }

    settingsdb.set(exports.BACKUP_CONFIG_KEY, JSON.stringify(backupConfig), function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.BACKUP_CONFIG_KEY, backupConfig);

        callback(null);
    });
}

function getUpdateConfig(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.get(exports.UPDATE_CONFIG_KEY, function (error, value) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return callback(null, gDefaults[exports.UPDATE_CONFIG_KEY]);
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, JSON.parse(value)); // { prerelease }
    });
}

function setUpdateConfig(updateConfig, callback) {
    assert.strictEqual(typeof updateConfig, 'object');
    assert.strictEqual(typeof callback, 'function');

    settingsdb.set(exports.UPDATE_CONFIG_KEY, JSON.stringify(updateConfig), function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        exports.events.emit(exports.UPDATE_CONFIG_KEY, updateConfig);

        callback(null);
    });
}

function getDefaultSync(name) {
    assert.strictEqual(typeof name, 'string');

    return gDefaults[name];
}

function getAll(callback) {
    assert.strictEqual(typeof callback, 'function');

    settingsdb.getAll(function (error, settings) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        var result = _.extend({ }, gDefaults);
        settings.forEach(function (setting) { result[setting.name] = setting.value; });

        callback(null, result);
    });
}
