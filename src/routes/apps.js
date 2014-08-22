/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/apps'),
    apps = require('../apps.js'),
    config = require('../../config.js'),
    AppsError = apps.AppsError;

exports = module.exports = {
    getApp: getApp,
    getAppBySubdomain: getAppBySubdomain,
    getApps: getApps,
    installApp: installApp,
    uninstallApp: uninstallApp,

    stopApp: stopApp,
    startApp: startApp
};

/*
 * Get installed (or scheduled to be installed) app
 */
function getApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    apps.get(req.params.id, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, app));
    });
}

/*
 * Get the app installed in the subdomain
 */
function getAppBySubdomain(req, res, next) {
    if (typeof req.params.subdomain !== 'string') return next(new HttpError(400, 'subdomain is required'));

    apps.getBySubdomain(req.params.subdomain, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such subdomain'));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, app));
    });
}

/*
 * Get installed (or scheduled to be installed) apps
 */
function getApps(req, res, next) {
    apps.getAll(function (error, allApps) {
        if (error) return next(new HttpError(500, 'Internal error:' + error));
        next(new HttpSuccess(200, { apps: allApps }));
    });
}

/*
 * Installs an app
 * @bodyparam {string} app_id The id of the app to be installed
 * @bodyparam {string} password The user's password
 * @bodyparam {string} location The subdomain where the app is to be installed
 * @bodyparam {object} portBindings map from container port to (public) host port. can be null.
 */
function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.app_id) return next(new HttpError(400, 'app_id is required'));
    if (!data.password) return next(new HttpError(400, 'password is required'));
    if (!data.location) return next(new HttpError(400, 'location is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));

    debug('will install app with id ' + data.app_id + ' @ ' + data.location + ' with ' + JSON.stringify(data.portBindings));

    apps.install(data.app_id, req.user.username, data.password, data.location, data.portBindings, function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, 'App already exists: ' + error));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, { } ));
    });
}

/*
 * Uninstalls an app
 * @bodyparam {string} id The id of the app to be uninstalled
 */
function uninstallApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    debug('will uninstall app with id ' + req.params.id);

    apps.uninstall(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { }));
    });
}

function startApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    debug('will start app with id ' + req.params.id);

    apps.start(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { }));
    });
}

function stopApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    debug('will stop app with id ' + req.params.id);

    apps.stop(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { }));
    });
}

