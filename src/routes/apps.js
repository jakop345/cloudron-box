/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/apps'),
    apps = require('../apps.js'),
    AppsError = apps.AppsError;

exports = module.exports = {
    initialize: initialize,
    getApp: getApp,
    getAppBySubdomain: getAppBySubdomain,
    getApps: getApps,
    installApp: installApp,
    uninstallApp: uninstallApp
};

var config = null;

function initialize(_config) {
    config = _config;
}

function getApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    apps.get(req.params.id, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, app));
    });
}

function getAppBySubdomain(req, res, next) {
    if (typeof req.params.subdomain !== 'string') return next(new HttpError(400, 'subdomain is required'));

    apps.getBySubdomain(req.params.subdomain, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such subdomain'));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, app));
    });
}

function getApps(req, res, next) {
    apps.getAll(function (error, allApps) {
        if (error) return next(new HttpError(500, 'Internal error:' + error));
        next(new HttpSuccess(200, { apps: allApps }));
    });
}

// http://stackoverflow.com/questions/7930751/regexp-for-subdomain
function checkDomainName(subdomain, fqdn) {
    if (subdomain.length > 63) return new Error('Subdomain length cannot be greater than 63');
    if (subdomain.match(/^[A-Za-z0-9-]+$/) === null) return new Error('Subdomain can only contain alphanumerics and hyphen');
    if (subdomain[0] === '-' || subdomain[subdomain.length-1] === '-') return new Error('Subdomain cannot start or end with hyphen');

    if (subdomain.length + 1 /* dot */ + fqdn.length > 255) return new Error('Domain length exceeds 255 characters');

    return null;
}

function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.app_id) return next(new HttpError(400, 'app_id is required'));
    if (!data.password) return next(new HttpError(400, 'password is required'));

    if (!data.location) return next(new HttpError(400, 'location is required'));
    if (data.location === 'admin') return next(new HttpError(400, 'admin location is reserved')); // TODO: maybe this should be reserved in db?
    var error = checkDomainName(data.location, config.fqdn);
    if (error) return next(new HttpError(400, error.message));

    if (data.portBindings !== null && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));

    var portBindings = [ ];

    // validate the port bindings
    for (var key in data.portBindings) {
        var containerPort = parseInt(key, 10);
        if (isNaN(containerPort) || containerPort <= 0 || containerPort > 65535) return next(new HttpError(400, key + ' is not a valid port'));

        var hostPort = parseInt(data.portBindings[containerPort], 10);
        if (isNaN(hostPort) || hostPort <= 1024 || hostPort > 65535) return next(new HttpError(400, data.portBindings[containerPort] + ' is not a valid port'));

        portBindings.push({ containerPort: containerPort, hostPort: hostPort });
    }

    debug('will install app with id ' + data.app_id + ' @ ' + data.location + ' with ' + JSON.stringify(portBindings));

    apps.install(data.app_id, req.user.username, data.password, data.location, portBindings, function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, 'Error installing app: ' + error));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, { status: 'ok' } ));
    });
}

function uninstallApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    debug('will uninstall app with id ' + req.params.id);

    apps.uninstall(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'Error uninstalling app' + error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { status: 'ok' }));
    });
}
