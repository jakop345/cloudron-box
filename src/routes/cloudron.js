/* jslint node:true */

'use strict';

var assert = require('assert'),
    cloudron = require('../cloudron.js'),
    config = require('../../config.js'),
    progress = require('../progress.js'),
    CloudronError = cloudron.CloudronError,
    debug = require('debug')('box:routes/cloudron'),
    df = require('nodejs-disks'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    superagent = require('superagent'),
    safe = require('safetydance'),
    updater = require('../updater.js');

exports = module.exports = {
    activate: activate,
    setupTokenAuth: setupTokenAuth,
    getStatus: getStatus,
    getStats: getStats,
    reboot: reboot,
    getProgress: getProgress,
    createBackup: createBackup,
    getConfig: getConfig,
    update: update,
    migrate: migrate,
    setCertificate: setCertificate
};

/**
 * Creating an admin user and activate the cloudron.
 *
 * @apiParam {string} username The administrator's user name
 * @apiParam {string} password The administrator's password
 * @apiParam {string} email The administrator's email address
 *
 * @apiSuccess (Created 201) {string} token A valid access token
 */
function activate(req, res, next) {
    assert(typeof req.body === 'object');
    assert(typeof req.query.setupToken === 'string');

    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username must be string'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password must be string'));
    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));

    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    debug('activate: username:%s ip:%s', username, ip);

    cloudron.activate(username, password, email, ip, function (error, info) {
        if (error && error.reason === CloudronError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already setup'));
        if (error && error.reason === CloudronError.BAD_USERNAME) return next(new HttpError(400, 'Bad username'));
        if (error && error.reason === CloudronError.BAD_PASSWORD) return next(new HttpError(400, 'Bad password'));
        if (error && error.reason === CloudronError.BAD_EMAIL) return next(new HttpError(400, 'Bad email'));
        if (error) return next(new HttpError(500, error));

        // skip calling the api server when running locally
        if (config.LOCAL) return next(new HttpSuccess(201, info));

        // Now let the api server know we got activated
        superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/setup/done').query({ setupToken:req.query.setupToken }).end(function (error, result) {
            if (error) return next(new HttpError(500, error));
            if (result.statusCode === 403) return next(new HttpError(403, 'Invalid token'));
            if (result.statusCode === 409) return next(new HttpError(409, 'Already setup'));
            if (result.statusCode !== 201) return next(new HttpError(500, result.text ? result.text.message : 'Internal error'));

            next(new HttpSuccess(201, info));
        });
    });
}

function setupTokenAuth(req, res, next) {
    assert(typeof req.query === 'object');

    if (typeof req.query.setupToken !== 'string') return next(new HttpError(400, 'no setupToken provided'));

    // Allow all setup tokens locally
    if (config.LOCAL) return next();

    superagent.get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/setup/verify').query({ setupToken:req.query.setupToken }).end(function (error, result) {
        if (error) return next(new HttpError(500, error));
        if (result.statusCode === 403) return next(new HttpError(403, 'Invalid token'));
        if (result.statusCode === 409) return next(new HttpError(409, 'Already setup'));
        if (result.statusCode !== 200) return next(new HttpError(500, result.text ? result.text.message : 'Internal error'));

        next();
    });
}

function getStatus(req, res, next) {
    cloudron.getStatus(function (error, status) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, status));
    });
}

function getStats(req, res, next) {
    df.drives(function (error, drives) {
        if (error) return next(new HttpError(500, error));

        df.drivesDetail(drives, function (err, data) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(200, { drives: data }));
        });
    });
}

function getProgress(req, res, next) {
    return next(new HttpSuccess(200, progress.get()));
}

function reboot(req, res, next) {
    // Finish the request, to let the appstore know we triggered the restore it
    next(new HttpSuccess(202, {}));

    cloudron.reboot();
}

function createBackup(req, res, next) {
    cloudron.backup(function (error) {
        if (error) console.error('backup failed.', error);
    });

    // we just schedule the backup but do not wait for the result
    next(new HttpSuccess(202, {}));
}

function getConfig(req, res, next) {
    cloudron.getConfig(function (error, cloudronConfig) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, cloudronConfig));
    });
}

function update(req, res, next) {
    updater.update(function (error) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function migrate(req, res, next) {
    if (typeof req.body.size !== 'string') return next(new HttpError(400, 'size must be string'));
    if (typeof req.body.restoreKey !== 'string') return next(new HttpError(400, 'restoreKey must be string'));

    cloudron.migrate(req.body.size, req.body.restoreKey, function (error) {
        if (error && error.reason === CloudronError.INVALID_STATE) return next(new HttpError(409, error));
        if (error && error.reason === CloudronError.NOT_FOUND) return next(new HttpError(404, error));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function setCertificate(req, res, next) {
    assert(typeof req.files === 'object');

    if (!req.files.certificate) return next(new HttpError(400, 'certificate must be provided'));
    var certificate = safe.fs.readFileSync(req.files.certificate.path, 'utf8');

    if (!req.files.key) return next(new HttpError(400, 'key must be provided'));
    var key = safe.fs.readFileSync(req.files.key.path, 'utf8');

    cloudron.setCertificate(certificate, key, function (error) {
        if (error && error.reason === CloudronError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}
