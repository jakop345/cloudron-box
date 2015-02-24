/* jslint node:true */

'use strict';

var assert = require('assert'),
    cloudron = require('../cloudron.js'),
    config = require('../../config.js'),
    progress = require('../progress.js'),
    CloudronError = cloudron.CloudronError,
    debug = require('debug')('box:routes/cloudron'),
    df = require('nodejs-disks'),
    execFile = require('child_process').execFile,
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    path = require('path'),
    superagent = require('superagent'),
    safe = require('safetydance'),
    UserError = require('../user.js').UserError,
    updater = require('../updater.js');

var SUDO = '/usr/bin/sudo',
    REBOOT_CMD = path.join(__dirname, '../scripts/reboot.sh');

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

    debug('activate: ' + username);

    cloudron.activate(username, password, email, function (error, info) {
        if (error instanceof UserError) {
            if (error.reason === UserError.BAD_PASSWORD) return next(new HttpError(400, 'Bad password'));
            if (error.reason === UserError.BAD_EMAIL) return next(new HttpError(400, 'Bad email'));
            if (error.reason === UserError.BAD_USERNAME) return next(new HttpError(400, 'Bad username'));
            else return next(new HttpError(400, 'Invalid message'));
        }
        if (error && error.reason === CloudronError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already setup'));
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
    debug('_reboot: execute "%s".', REBOOT_CMD);

    // Finish the request, to let the appstore know we triggered the restore it
    next(new HttpSuccess(202, {}));

    execFile(SUDO, [ REBOOT_CMD ], {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Reboot failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_reboot: success');
    });
}

function createBackup(req, res, next) {
    cloudron.backup(function (error) {
        if (error && error.reason === CloudronError.APPSTORE_DOWN) return next(new HttpError(503, error));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
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

