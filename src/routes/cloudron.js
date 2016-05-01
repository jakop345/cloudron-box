'use strict';

exports = module.exports = {
    activate: activate,
    setupTokenAuth: setupTokenAuth,
    getStatus: getStatus,
    reboot: reboot,
    getProgress: getProgress,
    getConfig: getConfig,
    update: update,
    feedback: feedback
};

var assert = require('assert'),
    cloudron = require('../cloudron.js'),
    CloudronError = cloudron.CloudronError,
    config = require('../config.js'),
    debug = require('debug')('box:routes/cloudron'),
    eventlog = require('../eventlog.js'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    progress = require('../progress.js'),
    mailer = require('../mailer.js'),
    superagent = require('superagent');

function auditSource(req) {
    var ip = req.headers['x-forwarded-for'] || req.ip || null;
    return { ip: ip, username: req.user ? req.user.username : null, userId: req.user ? req.user.id : null };
}

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
    if ('displayName' in req.body && typeof req.body.displayName !== 'string') return next(new HttpError(400, 'displayName must be string'));

    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;
    var displayName = req.body.displayName || '';

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    debug('activate: username:%s ip:%s', username, ip);

    cloudron.activate(username, password, email, displayName, ip, function (error, info) {
        if (error && error.reason === CloudronError.ALREADY_PROVISIONED) return next(new HttpError(409, 'Already setup'));
        if (error && error.reason === CloudronError.BAD_USERNAME) return next(new HttpError(400, 'Bad username'));
        if (error && error.reason === CloudronError.BAD_PASSWORD) return next(new HttpError(400, 'Bad password'));
        if (error && error.reason === CloudronError.BAD_EMAIL) return next(new HttpError(400, 'Bad email'));
        if (error) return next(new HttpError(500, error));

        eventlog.add(eventlog.ACTION_ACTIVATE, req, { username: username });

        // only in caas case do we have to notify the api server about activation
        if (config.provider() !== 'caas') return next(new HttpSuccess(201, info));

        // Now let the api server know we got activated
        superagent.post(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/setup/done').query({ setupToken: req.query.setupToken }).end(function (error, result) {
            if (error && !error.response) return next(new HttpError(500, error));
            if (result.statusCode === 403) return next(new HttpError(403, 'Invalid token'));
            if (result.statusCode === 409) return next(new HttpError(409, 'Already setup'));
            if (result.statusCode !== 201) return next(new HttpError(500, result.text || 'Internal error'));

            next(new HttpSuccess(201, info));
        });
    });
}

function setupTokenAuth(req, res, next) {
    assert.strictEqual(typeof req.query, 'object');

    // skip setupToken auth for non caas case
    if (config.provider() !== 'caas') return next();

    if (typeof req.query.setupToken !== 'string') return next(new HttpError(400, 'no setupToken provided'));

    superagent.get(config.apiServerOrigin() + '/api/v1/boxes/' + config.fqdn() + '/setup/verify').query({ setupToken:req.query.setupToken }).end(function (error, result) {
        if (error && !error.response) return next(new HttpError(500, error));
        if (result.statusCode === 403) return next(new HttpError(403, 'Invalid token'));
        if (result.statusCode === 409) return next(new HttpError(409, 'Already setup'));
        if (result.statusCode !== 200) return next(new HttpError(500, result.text || 'Internal error'));

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
    // this only initiates the update, progress can be checked via the progress route
    cloudron.updateToLatest(auditSource(req), function (error) {
        if (error && error.reason === CloudronError.ALREADY_UPTODATE) return next(new HttpError(422, error.message));
        if (error && error.reason === CloudronError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, {}));
    });
}

function feedback(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (req.body.type !== mailer.FEEDBACK_TYPE_FEEDBACK &&
        req.body.type !== mailer.FEEDBACK_TYPE_TICKET &&
        req.body.type !== mailer.FEEDBACK_TYPE_APP_MISSING &&
        req.body.type !== mailer.FEEDBACK_TYPE_UPGRADE_REQUEST &&
        req.body.type !== mailer.FEEDBACK_TYPE_APP_ERROR) return next(new HttpError(400, 'type must be either "ticket", "feedback", "app_missing", "app_error" or "upgrade_request"'));
    if (typeof req.body.subject !== 'string' || !req.body.subject) return next(new HttpError(400, 'subject must be string'));
    if (typeof req.body.description !== 'string' || !req.body.description) return next(new HttpError(400, 'description must be string'));

    mailer.sendFeedback(req.user, req.body.type, req.body.subject, req.body.description);

    next(new HttpSuccess(201, {}));
}
