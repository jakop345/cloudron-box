'use strict';

var apps = require('./apps.js'),
    AppsError = apps.AppsError,
    assert = require('assert'),
    async = require('async'),
    constants = require('../constants.js'),
    CronJob = require('cron').CronJob,
    EventEmitter = require('events').EventEmitter,
    safeCall = require('safetydance').safeCall,
    settingsdb = require('./settingsdb.js'),
    util = require('util');

var gEvents = new EventEmitter();

exports = module.exports = {
    SettingsError: SettingsError,

    getNakedDomain: getNakedDomain,
    setNakedDomain: setNakedDomain,

    getAutoupdatePattern: getAutoupdatePattern,
    setAutoupdatePattern: setAutoupdatePattern,

    getTimeZone: getTimeZone,
    setTimeZone: setTimeZone,

    getAll: getAll,

    NAKED_DOMAIN_KEY: 'naked_domain',
    AUTOUPDATE_PATTERN_KEY: 'autoupdate_pattern',
    TIME_ZONE_KEY: 'time_zone',

    events: gEvents
};

function SettingsError(reason, errorOrMessage) {
    assert(typeof reason === 'string');
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

function getNakedDomain(callback) {
    assert(typeof callback === 'function');

    settingsdb.get(exports.NAKED_DOMAIN_KEY, function (error, nakedDomain) {
        if (error) return callback(error);

        callback(null, nakedDomain);
    });
}

function getApp(appId, callback) {
    if (appId === constants.ADMIN_APPID) return callback(null, null);

    apps.get(appId, callback);
}

function setNakedDomain(appId, callback) {
    assert(typeof appId === 'string');
    assert(typeof callback === 'function');

    var apptask = require('./apptask.js'); // TODO: here to avoid circular dep

    getApp(appId, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return callback(new SettingsError(SettingsError.NOT_FOUND));

        async.series([
            apptask.writeNginxNakedDomainConfig.bind(null, app),
            settingsdb.set.bind(null, exports.NAKED_DOMAIN_KEY, appId)
        ], function (error) {
            if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

            callback(null);
        });
    });
}

function setAutoupdatePattern(pattern, callback) {
    assert(typeof pattern === 'string');
    assert(typeof callback === 'function');

    if (pattern !== 'never') { // check if pattern is valid
        var job = safeCall(function () { return new CronJob(pattern) });
        if (!job) return callback(new SettingsError(SettingsError.BAD_FIELD, 'Invalid pattern'));
    }

    settingsdb.set(exports.AUTOUPDATE_PATTERN_KEY, pattern, function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        gEvents.emit(exports.AUTOUPDATE_PATTERN_KEY, pattern);

        return callback(null);
    });
}

function getAutoupdatePattern(callback) {
    assert(typeof callback === 'function');

    settingsdb.get(exports.AUTOUPDATE_PATTERN_KEY, function (error, pattern) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, pattern);
    });
}

function setTimeZone(tz, callback) {
    assert(typeof tz === 'string');
    assert(typeof callback === 'function');

    settingsdb.set(exports.TIME_ZONE_KEY, tz, function (error) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        gEvents.emit(exports.TIME_ZONE_KEY, tz);

        return callback(null);
    });
}

function getTimeZone(callback) {
    assert(typeof callback === 'function');

    settingsdb.get(exports.TIME_ZONE_KEY, function (error, tz) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        callback(null, tz);
    });
}

function getAll(callback) {
    assert(typeof callback === 'function');

    settingsdb.getAll(function (error, settings) {
        if (error) return callback(new SettingsError(SettingsError.INTERNAL_ERROR, error));

        var result = { };
        settings.forEach(function (setting) { result[setting.name] = setting.value; });

        callback(null, result);
    });
}

