/* jslint node:true */

'use strict';

var apps = require('../apps.js'),
    AppsError = apps.AppsError,
    assert = require('assert'),
    config = require('../../config.js'),
    debug = require('debug')('box:routes/apps'),
    fs = require('fs'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    paths = require('../paths.js'),
    safe = require('safetydance'),
    util = require('util'),
    uuid = require('node-uuid');

exports = module.exports = {
    getApp: getApp,
    getAppBySubdomain: getAppBySubdomain,
    getApps: getApps,
    getAppIcon: getAppIcon,
    installApp: installApp,
    configureApp: configureApp,
    uninstallApp: uninstallApp,
    restoreApp: restoreApp,
    updateApp: updateApp,
    getLogs: getLogs,
    getLogStream: getLogStream,

    stopApp: stopApp,
    startApp: startApp,
    exec: exec
};

/*
 * Get installed (or scheduled to be installed) app
 */
function getApp(req, res, next) {
    assert(typeof req.params.id === 'string');

    apps.get(req.params.id, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, app));
    });
}

/*
 * Get the app installed in the subdomain
 */
function getAppBySubdomain(req, res, next) {
    assert(typeof req.params.subdomain === 'string');

    apps.getBySubdomain(req.params.subdomain, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such subdomain'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, app));
    });
}

/*
 * Get installed (or scheduled to be installed) apps
 */
function getApps(req, res, next) {
    apps.getAll(function (error, allApps) {
        if (error) return next(new HttpError(500, error));
        next(new HttpSuccess(200, { apps: allApps }));
    });
}

/*
 * Get the app icon
 */
function getAppIcon(req, res, next) {
    assert(typeof req.params.id === 'string');

    var iconPath = paths.APPICONS_DIR + '/' + req.params.id + '.png';
    fs.exists(iconPath, function (exists) {
        if (!exists) return next(new HttpError(404, 'No such icon'));
        res.sendFile(iconPath);
    });
}

/*
 * Installs an app
 * @bodyparam {string} appStoreId The id of the app to be installed
 * @bodyparam {manifest} manifest The app manifest
 * @bodyparam {string} password The user's password
 * @bodyparam {string} location The subdomain where the app is to be installed
 * @bodyparam {object} portBindings map from environment variable name to (public) host port. can be null.
                       If a value in manifest.tcpPorts is missing in portBindings, the port/service is disabled
 * @bodyparam {icon} icon Base64 encoded image
 */
function installApp(req, res, next) {
    assert(typeof req.body === 'object');

    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.manifest || typeof data.manifest !== 'object') return next(new HttpError(400, 'manifest is required'));
    if (typeof data.appStoreId !== 'string') return next(new HttpError(400, 'appStoreId is required'));
    if (typeof data.location !== 'string') return next(new HttpError(400, 'location is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));
    if (typeof data.accessRestriction !== 'string') return next(new HttpError(400, 'accessRestriction is required'));
    if ('icon' in data && typeof data.icon !== 'string') return next(new HttpError(400, 'icon is not a string'));

    // allow tests to provide an appId for testing
    var appId = (process.env.NODE_ENV === 'test' && typeof data.appId === 'string') ? data.appId : uuid.v4();

    debug('Installing app id:%s storeid:%s loc:%s port:%j restrict:%s manifest:%j', appId, data.appStoreId, data.location, data.portBindings, data.accessRestriction, data.manifest);

    apps.purchase(data.appStoreId, function (error) {
        if (error) return next(new HttpError(500, error));

        apps.install(appId, data.appStoreId, data.manifest, data.location, data.portBindings, data.accessRestriction, data.icon || null, function (error) {
            if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, error.message));
            if (error && error.reason === AppsError.PORT_RESERVED) return next(new HttpError(409, 'Port ' + error.message + ' is reserved.'));
            if (error && error.reason === AppsError.PORT_CONFLICT) return next(new HttpError(409, 'Port ' + error.message + ' is already in use.'));
            if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(202, { id: appId } ));
        });
    });
}

/*
 * Configure an app
 * @bodyparam {string} appId The id of the app to be installed
 * @bodyparam {string} password The user's password
 * @bodyparam {string} location The subdomain where the app is to be installed
 * @bodyparam {object} portBindings map from env to (public) host port. can be null.
                       If a value in manifest.tcpPorts is missing in portBindings, the port/service is disabled
 */
function configureApp(req, res, next) {
    assert(typeof req.body === 'object');
    assert(typeof req.params.id === 'string');

    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (typeof data.appId !== 'string') return next(new HttpError(400, 'appId is required'));
    if (typeof data.location !== 'string') return next(new HttpError(400, 'location is required'));
    if (typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));
    if (typeof data.accessRestriction !== 'string') return next(new HttpError(400, 'accessRestriction is required'));

    debug('Configuring app id:%s location:%s bindings:%j', req.params.id, data.location, data.portBindings);

    apps.configure(req.params.id, data.location, data.portBindings, data.accessRestriction, function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.PORT_RESERVED) return next(new HttpError(409, 'Port ' + error.message + ' is reserved.'));
        if (error && error.reason === AppsError.PORT_CONFLICT) return next(new HttpError(409, 'Port ' + error.message + ' is already in use.'));
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function restoreApp(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Restore app id:%s', req.params.id);

    apps.restore(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

/*
 * Uninstalls an app
 * @bodyparam {string} id The id of the app to be uninstalled
 */
function uninstallApp(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Uninstalling app id:%s', req.params.id);

    apps.uninstall(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function startApp(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Start app id:%s', req.params.id);

    apps.start(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function stopApp(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Stop app id:%s', req.params.id);

    apps.stop(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function updateApp(req, res, next) {
    assert(typeof req.params.id === 'string');
    assert(typeof req.body === 'object');

    var data = req.body;

    if (!data) return next(new HttpError(400, 'Cannot parse data field'));
    if (!data.manifest || typeof data.manifest !== 'object') return next(new HttpError(400, 'manifest is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));
    if ('icon' in data && typeof data.icon !== 'string') return next(new HttpError(400, 'icon is not a string'));

    debug('Update app id:%s to manifest:%j', req.params.id, data.manifest);

    apps.update(req.params.id, data.manifest, data.portBindings, data.icon, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

// this route is for streaming logs
function getLogStream(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Getting logstream of app id:%s', req.params.id);

    var fromLine = req.query.fromLine ? parseInt(req.query.fromLine, 10) : -10; // we ignore last-event-id
    if (isNaN(fromLine)) return next(new HttpError(400, 'fromLine must be a valid number'));

    function sse(id, data) { return 'id: ' + id + '\ndata: ' + data + '\n\n'; }

    if (req.headers.accept !== 'text/event-stream') return next(new HttpError(400, 'This API call requires EventStream'));

    apps.getLogStream(req.params.id, fromLine, function (error, logStream) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(412, error.message));
        if (error) return next(new HttpError(500, error));

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
            res.write(sse(obj.lineNumber, JSON.stringify(obj)));
        });
        logStream.on('end', res.end.bind(res));
        logStream.on('error', res.end.bind(res, null));
    });
}

// this route is for downloading logs
function getLogs(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Getting logs of app id:%s', req.params.id);

    apps.getLogs(req.params.id, function (error, logStream) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(412, error.message));
        if (error) return next(new HttpError(500, error));

        res.writeHead(200, {
            'Content-Type': 'application/x-logs',
            'Content-Disposition': 'attachment; filename="log.txt"',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no' // disable nginx buffering
        });
        logStream.pipe(res);
    });
}

function exec(req, res, next) {
    assert(typeof req.params.id === 'string');

    debug('Execing into app id:%s', req.params.id);

    var cmd = null;
    if (req.query.cmd) {
        cmd = safe.JSON.parse(req.query.cmd);
        if (!util.isArray(cmd) && cmd.length < 1) return next(new HttpError(400, 'cmd must be array with atleast size 1'));
    }

    var columns = req.query.columns ? parseInt(req.query.columns, 10) : null;
    if (columns === NaN) return next(new HttpError(400, 'columns must be a number'));

    var rows = req.query.rows ? parseInt(req.query.rows, 10) : null;
    if (rows === NaN) return next(new HttpError(400, 'rows must be a number'));

    apps.exec(req.params.id, { cmd: cmd, rows: rows, columns: columns }, function (error, duplexStream) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        if (req.headers['upgrade'] !== 'tcp') return next(new HttpError(404, 'exec requires TCP upgrade'));

        req.clearTimeout();
        res.sendUpgradeHandshake();

        duplexStream.pipe(res.socket);
        res.socket.pipe(duplexStream);
    });
}

