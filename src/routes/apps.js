'use strict';

exports = module.exports = {
    getApp: getApp,
    getApps: getApps,
    getAppIcon: getAppIcon,
    installApp: installApp,
    configureApp: configureApp,
    uninstallApp: uninstallApp,
    restoreApp: restoreApp,
    backupApp: backupApp,
    updateApp: updateApp,
    getLogs: getLogs,
    getLogStream: getLogStream,
    listBackups: listBackups,

    stopApp: stopApp,
    startApp: startApp,
    exec: exec
};

var apps = require('../apps.js'),
    AppsError = apps.AppsError,
    assert = require('assert'),
    debug = require('debug')('box:routes/apps'),
    fs = require('fs'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    paths = require('../paths.js'),
    safe = require('safetydance'),
    util = require('util'),
    uuid = require('node-uuid');

function auditSource(req) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || null;
    return { ip: ip, username: req.user ? req.user.username : null, userId: req.user ? req.user.id : null };
}

function removeInternalAppFields(app) {
    return {
        id: app.id,
        appStoreId: app.appStoreId,
        installationState: app.installationState,
        installationProgress: app.installationProgress,
        runState: app.runState,
        health: app.health,
        location: app.location,
        accessRestriction: app.accessRestriction,
        lastBackupId: app.lastBackupId,
        manifest: app.manifest,
        portBindings: app.portBindings,
        iconUrl: app.iconUrl,
        fqdn: app.fqdn,
        memoryLimit: app.memoryLimit,
        altDomain: app.altDomain
    };
}

function getApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    apps.get(req.params.id, function (error, app) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, removeInternalAppFields(app)));
    });
}

function getApps(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    var func = req.user.admin ? apps.getAll : apps.getAllByUser.bind(null, req.user);
    func(function (error, allApps) {
        if (error) return next(new HttpError(500, error));

        allApps = allApps.map(removeInternalAppFields);

        next(new HttpSuccess(200, { apps: allApps }));
    });
}

function getAppIcon(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    var iconPath = paths.APPICONS_DIR + '/' + req.params.id + '.png';
    fs.exists(iconPath, function (exists) {
        if (!exists) return next(new HttpError(404, 'No such icon'));
        res.sendFile(iconPath);
    });
}

function installApp(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    var data = req.body;

    // atleast one
    if ('manifest' in data && typeof data.manifest !== 'object') return next(new HttpError(400, 'manifest is required'));
    if ('appStoreId' in data && typeof data.appStoreId !== 'string') return next(new HttpError(400, 'appStoreId is required'));
    if (!data.manifest && !data.appStoreId) return next(new HttpError(400, 'appStoreId or manifest is required'));

    // required
    if (typeof data.location !== 'string') return next(new HttpError(400, 'location is required'));
    if (typeof data.accessRestriction !== 'object') return next(new HttpError(400, 'accessRestriction is required'));

    // optional
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));
    if ('icon' in data && typeof data.icon !== 'string') return next(new HttpError(400, 'icon is not a string'));
    if ('cert' in data && typeof data.cert !== 'string') return next(new HttpError(400, 'cert must be a string'));
    if ('key' in data && typeof data.key !== 'string') return next(new HttpError(400, 'key must be a string'));
    if (data.cert && !data.key) return next(new HttpError(400, 'key must be provided'));
    if (!data.cert && data.key) return next(new HttpError(400, 'cert must be provided'));
    if ('memoryLimit' in data && typeof data.memoryLimit !== 'number') return next(new HttpError(400, 'memoryLimit is not a number'));
    if ('altDomain' in data && typeof data.altDomain !== 'string') return next(new HttpError(400, 'altDomain must be a string'));

    // allow tests to provide an appId for testing
    var appId = (process.env.BOX_ENV === 'test' && typeof data.appId === 'string') ? data.appId : uuid.v4();

    debug('Installing app id:%s data:%j', appId, data);

    apps.install(appId, data, auditSource(req), function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.PORT_RESERVED) return next(new HttpError(409, 'Port ' + error.message + ' is reserved.'));
        if (error && error.reason === AppsError.PORT_CONFLICT) return next(new HttpError(409, 'Port ' + error.message + ' is already in use.'));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.BILLING_REQUIRED) return next(new HttpError(402, 'Billing required'));
        if (error && error.reason === AppsError.BAD_CERTIFICATE) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.USER_REQUIRED) return next(new HttpError(400, 'accessRestriction must specify one user'));
        if (error && error.reason === AppsError.EXTERNAL_ERROR) return next(new HttpError(503, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { id: appId } ));
    });
}

function configureApp(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');
    assert.strictEqual(typeof req.params.id, 'string');

    var data = req.body;

    if (typeof data.location !== 'string') return next(new HttpError(400, 'location is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));
    if (typeof data.accessRestriction !== 'object') return next(new HttpError(400, 'accessRestriction is required'));
    if (data.cert && typeof data.cert !== 'string') return next(new HttpError(400, 'cert must be a string'));
    if (data.key && typeof data.key !== 'string') return next(new HttpError(400, 'key must be a string'));
    if (data.cert && !data.key) return next(new HttpError(400, 'key must be provided'));
    if (!data.cert && data.key) return next(new HttpError(400, 'cert must be provided'));
    if ('memoryLimit' in data && typeof data.memoryLimit !== 'number') return next(new HttpError(400, 'memoryLimit is not a number'));
    if (data.altDomain && typeof data.altDomain !== 'string') return next(new HttpError(400, 'altDomain must be a string'));

    debug('Configuring app id:%s location:%s bindings:%j accessRestriction:%j memoryLimit:%s', req.params.id, data.location, data.portBindings, data.accessRestriction, data.memoryLimit);

    apps.configure(req.params.id, data.location, data.portBindings || null, data.accessRestriction, data.cert || null, data.key || null, data.memoryLimit || 0, data.altDomain || null, auditSource(req), function (error) {
        if (error && error.reason === AppsError.ALREADY_EXISTS) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.PORT_RESERVED) return next(new HttpError(409, 'Port ' + error.message + ' is reserved.'));
        if (error && error.reason === AppsError.PORT_CONFLICT) return next(new HttpError(409, 'Port ' + error.message + ' is already in use.'));
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.BAD_CERTIFICATE) return next(new HttpError(400, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function restoreApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Restore app id:%s', req.params.id);

    apps.restore(req.params.id, auditSource(req), function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function backupApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Backup app id:%s', req.params.id);

    apps.backup(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.EXTERNAL_ERROR) return next(new HttpError(503, error));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function uninstallApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Uninstalling app id:%s', req.params.id);

    apps.uninstall(req.params.id, auditSource(req), function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function startApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Start app id:%s', req.params.id);

    apps.start(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function stopApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Stop app id:%s', req.params.id);

    apps.stop(req.params.id, function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

function updateApp(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');
    assert.strictEqual(typeof req.body, 'object');

    var data = req.body;

    if (!data.manifest || typeof data.manifest !== 'object') return next(new HttpError(400, 'manifest is required'));
    if (('portBindings' in data) && typeof data.portBindings !== 'object') return next(new HttpError(400, 'portBindings must be an object'));
    if ('icon' in data && typeof data.icon !== 'string') return next(new HttpError(400, 'icon is not a string'));
    if ('force' in data && typeof data.force !== 'boolean') return next(new HttpError(400, 'force must be a boolean'));

    debug('Update app id:%s to manifest:%j with portBindings:%j', req.params.id, data.manifest, data.portBindings);

    apps.update(req.params.id, data.force || false, data.manifest, data.portBindings || null, data.icon, auditSource(req), function (error) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_FIELD) return next(new HttpError(400, error.message));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error && error.reason === AppsError.PORT_CONFLICT) return next(new HttpError(409, 'Port ' + error.message + ' is already in use.'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(202, { }));
    });
}

// this route is for streaming logs
function getLogStream(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Getting logstream of app id:%s', req.params.id);

    var lines = req.query.lines ? parseInt(req.query.lines, 10) : -10; // we ignore last-event-id
    if (isNaN(lines)) return next(new HttpError(400, 'lines must be a valid number'));

    function sse(id, data) { return 'id: ' + id + '\ndata: ' + data + '\n\n'; }

    if (req.headers.accept !== 'text/event-stream') return next(new HttpError(400, 'This API call requires EventStream'));

    apps.getLogs(req.params.id, lines, true /* follow */, function (error, logStream) {
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
            res.write(sse(obj.monotonicTimestamp, JSON.stringify(obj))); // send timestamp as id
        });
        logStream.on('end', res.end.bind(res));
        logStream.on('error', res.end.bind(res, null));
    });
}

function getLogs(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    var lines = req.query.lines ? parseInt(req.query.lines, 10) : 100;
    if (isNaN(lines)) return next(new HttpError(400, 'lines must be a number'));

    debug('Getting logs of app id:%s', req.params.id);

    apps.getLogs(req.params.id, lines, false /* follow */, function (error, logStream) {
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

function demuxStream(stream, stdin) {
    var header = null;

    stream.on('readable', function() {
        header = header || stream.read(4);

        while (header !== null) {
            var length = header.readUInt32BE(0);
            if (length === 0) {
                header = null;
                return stdin.end(); // EOF
            }

            var payload = stream.read(length);

            if (payload === null) break;
            stdin.write(payload);
            header = stream.read(4);
        }
    });
}

function exec(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    debug('Execing into app id:%s and cmd:%s', req.params.id, req.query.cmd);

    var cmd = null;
    if (req.query.cmd) {
        cmd = safe.JSON.parse(req.query.cmd);
        if (!util.isArray(cmd) || cmd.length < 1) return next(new HttpError(400, 'cmd must be array with atleast size 1'));
    }

    var columns = req.query.columns ? parseInt(req.query.columns, 10) : null;
    if (isNaN(columns)) return next(new HttpError(400, 'columns must be a number'));

    var rows = req.query.rows ? parseInt(req.query.rows, 10) : null;
    if (isNaN(rows)) return next(new HttpError(400, 'rows must be a number'));

    var tty = req.query.tty === 'true' ? true : false;

    apps.exec(req.params.id, { cmd: cmd, rows: rows, columns: columns, tty: tty }, function (error, duplexStream) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error && error.reason === AppsError.BAD_STATE) return next(new HttpError(409, error.message));
        if (error) return next(new HttpError(500, error));

        if (req.headers['upgrade'] !== 'tcp') return next(new HttpError(404, 'exec requires TCP upgrade'));

        req.clearTimeout();
        res.sendUpgradeHandshake();

        // When tty is disabled, the duplexStream has 2 separate streams. When enabled, it has stdout/stderr merged.
        duplexStream.pipe(res.socket);

        if (tty) {
            res.socket.pipe(duplexStream); // in tty mode, the client always waits for server to exit
        } else {
            demuxStream(res.socket, duplexStream);
            res.socket.on('error', function () { duplexStream.end(); });
            res.socket.on('end', function () { duplexStream.end(); });
        }
    });
}

function listBackups(req, res, next) {
    assert.strictEqual(typeof req.params.id, 'string');

    var page = typeof req.query.page !== 'undefined' ? parseInt(req.query.page) : 1;
    if (!page || page < 0) return next(new HttpError(400, 'page query param has to be a postive number'));

    var perPage = typeof req.query.per_page !== 'undefined'? parseInt(req.query.per_page) : 25;
    if (!perPage || perPage < 0) return next(new HttpError(400, 'per_page query param has to be a postive number'));

    apps.listBackups(page, perPage, req.params.id, function (error, result) {
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(404, 'No such app'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, { backups: result }));
    });
}
