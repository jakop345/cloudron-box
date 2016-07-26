'use strict';

exports = module.exports = {
    getAutoupdatePattern: getAutoupdatePattern,
    setAutoupdatePattern: setAutoupdatePattern,

    getCloudronName: getCloudronName,
    setCloudronName: setCloudronName,

    getCloudronAvatar: getCloudronAvatar,
    setCloudronAvatar: setCloudronAvatar,

    getDnsConfig: getDnsConfig,
    setDnsConfig: setDnsConfig,

    getBackupConfig: getBackupConfig,
    setBackupConfig: setBackupConfig,

    getTimeZone: getTimeZone,
    setTimeZone: setTimeZone,

    getAppstoreConfig: getAppstoreConfig,
    setAppstoreConfig: setAppstoreConfig,

    setCertificate: setCertificate,
    setAdminCertificate: setAdminCertificate
};

var assert = require('assert'),
    certificates = require('../certificates.js'),
    CertificatesError = require('../certificates.js').CertificatesError,
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    safe = require('safetydance'),
    settings = require('../settings.js'),
    SettingsError = settings.SettingsError;

function getAutoupdatePattern(req, res, next) {
    settings.getAutoupdatePattern(function (error, pattern) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { pattern: pattern }));
    });
}

function setAutoupdatePattern(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.pattern !== 'string') return next(new HttpError(400, 'pattern is required'));

    settings.setAutoupdatePattern(req.body.pattern, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

function setCloudronName(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.name !== 'string') return next(new HttpError(400, 'name is required'));

    settings.setCloudronName(req.body.name, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

function getCloudronName(req, res, next) {
    settings.getCloudronName(function (error, name) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { name: name }));
    });
}

function getTimeZone(req, res, next) {
    settings.getTimeZone(function (error, tz) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { timeZone: tz }));
    });
}

function setTimeZone(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.timeZone !== 'string') return next(new HttpError(400, 'timeZone is required'));

    settings.setTimeZone(req.body.timeZone, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

function setCloudronAvatar(req, res, next) {
    assert.strictEqual(typeof req.files, 'object');

    if (!req.files.avatar) return next(new HttpError(400, 'avatar must be provided'));
    var avatar = safe.fs.readFileSync(req.files.avatar.path);

    settings.setCloudronAvatar(avatar, function (error) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function getCloudronAvatar(req, res, next) {
    settings.getCloudronAvatar(function (error, avatar) {
        if (error) return next(new HttpError(500, error));

        // avoid caching the avatar on the client to see avatar changes immediately
        res.set('Cache-Control', 'no-cache');

        res.set('Content-Type', 'image/png');
        res.status(200).send(avatar);
    });
}

function getDnsConfig(req, res, next) {
    settings.getDnsConfig(function (error, config) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, config));
    });
}

function setDnsConfig(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.provider !== 'string') return next(new HttpError(400, 'provider is required'));

    settings.setDnsConfig(req.body, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

function getBackupConfig(req, res, next) {
    settings.getBackupConfig(function (error, config) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, config));
    });
}

function setBackupConfig(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.provider !== 'string') return next(new HttpError(400, 'provider is required'));

    settings.setBackupConfig(req.body, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

function getAppstoreConfig(req, res, next) {
    settings.getAppstoreConfig(function (error, result) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, result));
    });
}

function setAppstoreConfig(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.userId !== 'string') return next(new HttpError(400, 'userId is required'));
    if (typeof req.body.token !== 'string') return next(new HttpError(400, 'token is required'));

    var options = {
        userId: req.body.userId,
        token: req.body.token
    };

    settings.setAppstoreConfig(options, function (error) {
        if (error && error.reason === SettingsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200));
    });
}

// default fallback cert
function setCertificate(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (!req.body.cert || typeof req.body.cert !== 'string') return next(new HttpError(400, 'cert must be a string'));
    if (!req.body.key || typeof req.body.key !== 'string') return next(new HttpError(400, 'key must be a string'));

    certificates.setFallbackCertificate(req.body.cert, req.body.key, function (error) {
        if (error && error.reason === CertificatesError.INVALID_CERT) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

// only webadmin cert, until it can be treated just like a normal app
function setAdminCertificate(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (!req.body.cert || typeof req.body.cert !== 'string') return next(new HttpError(400, 'cert must be a string'));
    if (!req.body.key || typeof req.body.key !== 'string') return next(new HttpError(400, 'key must be a string'));

    certificates.setAdminCertificate(req.body.cert, req.body.key, function (error) {
        if (error && error.reason === CertificatesError.INVALID_CERT) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}
