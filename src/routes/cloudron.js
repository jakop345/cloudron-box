/* jslint node:true */

'use strict';

exports = module.exports = {
    activate: activate,
    setupTokenAuth: setupTokenAuth,
    getStatus: getStatus,
    reboot: reboot,
    getProgress: getProgress,
    getConfig: getConfig,
    update: update,
    migrate: migrate,
    setCertificate: setCertificate
};

var assert = require('assert'),
    cloudron = require('../cloudron.js'),
    constants = require('../../constants.js'),
    config = require('../../config.js'),
    progress = require('../progress.js'),
    CloudronError = cloudron.CloudronError,
    debug = require('debug')('box:routes/cloudron'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    superagent = require('superagent'),
    safe = require('safetydance'),
    updateChecker = require('../updatechecker.js');

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
    assert.strictEqual(typeof req.body, 'object');
    assert.strictEqual(typeof req.query.setupToken, 'string');

    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username must be string'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password must be string'));
    if (typeof req.body.email !== 'string') return next(new HttpError(400, 'email must be string'));
    if ('name' in req.body && typeof req.body.name !== 'string') return next(new HttpError(400, 'name must be a string'));

    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;
    var name = req.body.name || null;

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    debug('activate: username:%s ip:%s', username, ip);

    cloudron.activate(username, password, email, name, ip, function (error, info) {
        if (error && error.reason === CloudronError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already setup'));
        if (error && error.reason === CloudronError.BAD_USERNAME) return next(new HttpError(400, 'Bad username'));
        if (error && error.reason === CloudronError.BAD_PASSWORD) return next(new HttpError(400, 'Bad password'));
        if (error && error.reason === CloudronError.BAD_EMAIL) return next(new HttpError(400, 'Bad email'));
        if (error && error.reason === CloudronError.BAD_NAME) return next(new HttpError(400, 'Bad name'));
        if (error) return next(new HttpError(500, error));

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
    assert.strictEqual(typeof req.query, 'object');

    if (typeof req.query.setupToken !== 'string') return next(new HttpError(400, 'no setupToken provided'));

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

function getProgress(req, res, next) {
    return next(new HttpSuccess(200, progress.get()));
}

function reboot(req, res, next) {
    // Finish the request, to let the appstore know we triggered the restore it
    next(new HttpSuccess(202, {}));

    cloudron.reboot();
}

function getConfig(req, res, next) {
    cloudron.getConfig(function (error, cloudronConfig) {
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, cloudronConfig));
    });
}

function update(req, res, next) {
    var boxUpdateInfo = updateChecker.getUpdateInfo().box;
    if (!boxUpdateInfo) return next(new HttpError(422, 'No update available'));

    // this only initiates the update, progress can be checked via the progress route
    cloudron.update(boxUpdateInfo, function (error) {
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function migrate(req, res, next) {
    if (typeof req.body.size !== 'string') return next(new HttpError(400, 'size must be string'));
    if (typeof req.body.region !== 'string') return next(new HttpError(400, 'region must be string'));

    debug('Migration requested', req.body.size, req.body.region);

    cloudron.migrate(req.body.size, req.body.region, function (error) {
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function setCertificate(req, res, next) {
    assert.strictEqual(typeof req.files, 'object');

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
