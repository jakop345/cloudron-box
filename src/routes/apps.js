/* jslint node:true */

'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    debug = require('debug')('box:routes/apps'),
    apps = require('../apps.js'),
    config = require('../../config.js'),
    uuid = require('node-uuid'),
    fs = require('fs'),
    AppsError = apps.AppsError;

exports = module.exports = {
    getApp: getApp,
    getAppBySubdomain: getAppBySubdomain,
    getApps: getApps,
    getAppIcon: getAppIcon,
    installApp: installApp,
    configureApp: configureApp,
    uninstallApp: uninstallApp,
    updateApp: updateApp,
    getLogs: getLogs,
    getLogStream: getLogStream,

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
 * Get the app icon
 */
function getAppIcon(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    var iconPath = config.iconsRoot + '/' + req.params.id + '.png';
    fs.exists(iconPath, function (exists) {
        if (!exists) return next(new HttpError(404, 'No such icon'));
        res.sendfile(iconPath);
    });
}

/*
 * Installs an app
 * @bodyparam {string} appStoreId The id of the app to be installed
 * @bodyparam {string} password The user's password
 * @bodyparam {string} location The subdomain where the app is to be installed
 * @bodyparam {object} portBindings map from container port to (public) host port. can be null.
 */
function installApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.appStoreId) return next(new HttpError(400, 'appStoreId is required'));
    if (!data.password) return next(new HttpError(400, 'password is required'));
    if (!data.location) return next(new HttpError(400, 'location is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));

    // allow tests to provide an appId for testing
    var appId = (process.env.NODE_ENV === 'test' && typeof data.appId === 'string') ? data.appId : uuid.v4();

    debug('will install app with instance id ' + appId + ' storeId: ' + data.appStoreId +
          ' @ ' + data.location + ' with ' + JSON.stringify(data.portBindings));

    apps.install(appId, data.appStoreId, req.user.username, data.password, data.location, data.portBindings, function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, 'App already exists: ' + error));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, 'Internal error:' + error));

        next(new HttpSuccess(200, { id: appId } ));
    });
}

/*
 * Configure an app
 * @bodyparam {string} appId The id of the app to be installed
 * @bodyparam {string} password The user's password
 * @bodyparam {string} location The subdomain where the app is to be installed
 * @bodyparam {object} portBindings map from container port to (public) host port. can be null.
 */
function configureApp(req, res, next) {
    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.appId) return next(new HttpError(400, 'appId is required'));
    if (!data.password) return next(new HttpError(400, 'password is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));

    debug('will configure app with id ' + data.appId + ' @ ' + data.location + ' with ' + JSON.stringify(data.portBindings));

    apps.configure(data.appId, req.user.username, data.password, data.location, data.portBindings, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error));
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
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { }));
    });
}

function stopApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    debug('will stop app with id ' + req.params.id);

    apps.stop(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { }));
    });
}

function updateApp(req, res, next) {
    if (typeof req.params.id !== 'string') return next(new HttpError(400, 'appid is required'));

    debug('with update app with id ' + req.params.id);

    apps.update(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        next(new HttpSuccess(200, { }));
    });
}

function getLogStream(req, res, next) {
    debug('getting logstream of ' + req.params.id);

    var fromLine = parseInt(req.query.fromLine || 0, 10);

    function sse(id, data) { return 'id: ' + id + '\ndata: ' + data + '\n\n'; };

    if (req.headers.accept !== 'text/event-stream') return next(new HttpError(400, 'This API call requires EventStream'));

    var fromLine = (parseInt(req.headers['last-event-id'], 10) + 1) || 1;

    apps.getLogStream(req.params.id, { fromLine: fromLine }, function (error, logStream) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // disable nginx buffering
            'Access-Control-Allow-Origin': '*'
        });
        res.write('retry: 3000\n');
        res.on('close', logStream.close);
        logStream.on('data', function (data) {
            var obj = JSON.parse(data);
            res.write(sse(obj.lineNumber, obj.log));
        });
        logStream.on('end', res.end.bind(res));
        logStream.on('error', res.end.bind(res, null));
    });
}

function getLogs(req, res, next) {
    debug('getting logs of ' + req.params.id);

    apps.getLogs(req.params.id, function (error, logStream) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app:' + error));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error));
        if (error) return next(new HttpError(500, 'Internal error: ' + error));

        res.writeHead(200, {
            'Content-Type': 'application/x-logs',
            'Content-Disposition': 'attachment; filename="log.txt"',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no' // disable nginx buffering
        });
        logStream.pipe(res);
    });
}

