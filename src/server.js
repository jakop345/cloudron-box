/* jslint node: true */

'use strict';

var express = require('express'),
    http = require('http'),
    https = require('https'),
    HttpError = require('./httperror.js'),
    HttpSuccess = require('./httpsuccess.js'),
    path = require('path'),
    os = require('os'),
    passport = require('passport'),
    superagent = require('superagent'),
    mkdirp = require('mkdirp'),
    routes = require('./routes/index.js'),
    debug = require('debug')('box:server'),
    assert = require('assert'),
    child_process = require('child_process'),
    fs = require('fs'),
    exec = require('child_process').exec,
    df = require('nodejs-disks'),
    apps = require('./apps'),
    Updater = require('./updater.js'),
    middleware = require('./middleware'),
    database = require('./database.js'),
    clientdb = require('./clientdb.js'),
    userdb = require('./userdb'),
    config = require('../config.js'),
    backups = require('./backups.js'),
    _ = require('underscore');

exports = module.exports = Server;

var HEARTBEAT_INTERVAL = 1000 * 60;// * 60;
var RELOAD_NGINX_CMD = 'sudo ' + path.join(__dirname, 'scripts/reloadnginx.sh');
var RESTORE_CMD = 'sudo ' + path.join(__dirname, 'scripts/restore.sh');
var REBOOT_CMD = 'sudo ' + path.join(__dirname, 'scripts/reboot.sh');

function Server() {
    this.httpServer = null; // http server
    this.app = null; // express
    this._announceTimerId = null;
    this._backupTimerId = null;
    this._updater = null;
}

// Success handler
Server.prototype._successHandler = function (success, req, res, next) {
    // for now when we hit here, we always send json back
    res.setHeader('Content-Type', 'application/json');

    if (success instanceof HttpSuccess) {
        debug('Send response with status', success.statusCode); //, 'and body', success.body);
        res.send(success.statusCode, success.body);
    } else {
        next(success);
    }
};

// Error handlers. These are called until one of them sends headers
Server.prototype._clientErrorHandler = function (err, req, res, next) {
    var status = err.status || err.statusCode; // connect/express or our app

    // if the request took too long, assume it's a problem on the client
    if (err.timeout && err.status == 503) { // timeout() middleware
        status = 408;
    }

    if (status >= 400 && status <= 499) {
        res.send(status, { status: http.STATUS_CODES[status], message: err.message });
        debug(http.STATUS_CODES[status] + ' : ' + err.message);
        debug(err.stack);
    } else {
        next(err);
    }
};

Server.prototype._serverErrorHandler = function (err, req, res, next) {
    var status = err.status || err.statusCode || 500;
    res.send(status, { status: http.STATUS_CODES[status], message: err.message ? err.message : 'Internal Server Error' });
    console.error(http.STATUS_CODES[status] + ' : ' + err.message);
    console.error(err.stack);
};

/**
 * @api {get} /api/v1/firsttime firstTime
 * @apiName firstTime
 * @apiGroup generic
 * @apiDescription
 * Ask the device if it is already activated. The device only leaves the activation mode when a device administrator is created.
 *
 * @apiSuccess {Boolean} activated True if the device was already activated otherwise false.
 * @apiSuccess {String} version The current version string of the device.
 */
Server.prototype._firstTime = function (req, res) {
    userdb.count(function (error, count) {
        if (error) return res.send(500, { status: http.STATUS_CODES[500], message: error.message || 'Internal Server error' });

        return res.send(200, { activated: count !== 0, version: config.version });
    });
};

/**
 * @api {get} /api/v1/version version
 * @apiName version
 * @apiGroup generic
 * @apiDescription
 *  Get the device's software version. Same string as in the <code>package.json</code>
 *
 * @apiSuccess {String} version The current version string of the device.
 */
Server.prototype._getVersion = function (req, res) {
    res.send(200, { version: config.version });
};

Server.prototype._getIp = function (callback) {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        if (dev.match(/^(en|eth).*/) === null) continue;

        for (var i = 0; i < ifaces[dev].length; i++) {
            if (ifaces[dev][i].family === 'IPv4') return ifaces[dev][i].address;
        }
    }

    return null;
};

Server.prototype._getConfig = function (req, res, next) {
    var that = this;

    var gitRevisionCommand = 'git log -1 --pretty=format:%h';
    exec(gitRevisionCommand, {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Failed to get git revision.', error, stdout, stderr);
            stdout = null;
        }

        next(new HttpSuccess(200, {
            appServerUrl: config.appServerUrl,
            fqdn: config.fqdn,
            ip: that._getIp(),
            version: config.version,
            revision: stdout,
            update: that._updater.availableUpdate()
        }));
    });
};

Server.prototype._getCloudronStats = function (req, res, next) {
    df.drives(function (error, drives) {
        if (error) return next(new HttpError(500, error));

        df.drivesDetail(drives, function (err, data) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(200, { drives: data }));
        });
    });
};

Server.prototype._update = function (req, res, next) {
    this._updater.update(function (error) {
        if (error) return next(new HttpError(500, error));
        res.send(200, {});
    });
};

Server.prototype._reboot = function (req, res, next) {
    debug('_reboot: execute "%s".', REBOOT_CMD);

    // Finish the request, to let the appstore know we triggered the restore it
    // TODO is there a better way?
    next(new HttpSuccess(200, {}));

    exec(REBOOT_CMD, {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Reboot failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_reboot: success');
    });
};

Server.prototype._restore = function (req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.fileName) return next(new HttpError(400, 'No restore file name provided'));
    if (!req.body.aws) return next(new HttpError(400, 'No aws credentials provided'));
    if (!req.body.aws.prefix) return next(new HttpError(400, 'No aws prefix provided'));
    if (!req.body.aws.bucket) return next(new HttpError(400, 'No aws bucket provided'));
    if (!req.body.aws.accessKeyId) return next(new HttpError(400, 'No aws access key provided'));
    if (!req.body.aws.secretAccessKey) return next(new HttpError(400, 'No aws secret provided'));

    debug('_restore: received from appstore ' + req.body.appServerUrl);

    var args = [
        req.body.aws.accessKeyId,
        req.body.aws.secretAccessKey,
        req.body.aws.prefix,
        req.body.aws.bucket,
        req.body.fileName,
        req.body.token
    ];

    var restoreCommandLine = RESTORE_CMD + ' ' + args.join(' ');
    debug('_restore: execute "%s".', restoreCommandLine);

    // Finish the request, to let the appstore know we triggered the restore it
    // TODO is there a better way?
    next(new HttpSuccess(200, {}));

    exec(restoreCommandLine, {}, function (error, stdout, stderr) {
        if (error) {
            console.error('Restore failed.', error, stdout, stderr);
            return next(new HttpError(500, error));
        }

        debug('_restore: success');
    });
};

Server.prototype._provision = function (req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.appServerUrl) return next(new HttpError(400, 'No appServerUrl provided'));
    if (!req.body.adminOrigin) return next(new HttpError(400, 'No adminOrigin provided'));
    if (!req.body.fqdn) return next(new HttpError(400, 'No fqdn provided'));
    if (!req.body.ip) return next(new HttpError(400, 'No ip provided'));
    if (!req.body.aws) return next(new HttpError(400, 'No aws credentials provided'));
    if (!req.body.aws.prefix) return next(new HttpError(400, 'No aws prefix provided'));
    if (!req.body.aws.bucket) return next(new HttpError(400, 'No aws bucket provided'));
    if (!req.body.aws.accessKeyId) return next(new HttpError(400, 'No aws access key provided'));
    if (!req.body.aws.secretAccessKey) return next(new HttpError(400, 'No aws secret provided'));

    debug('_provision: received from appstore ' + req.body.appServerUrl);

    var that = this;

    if (config.token) return next(new HttpError(409, 'Already provisioned'));

    config.set(_.pick(req.body, 'token', 'appServerUrl', 'adminOrigin', 'fqdn', 'aws'));

    // override the default webadmin OAuth client record
    clientdb.del('webadmin', function () {
        clientdb.add('webadmin', 'cid-webadmin', 'unused', 'WebAdmin', config.adminOrigin, function (error) {
            if (error) return next(new HttpError(500, error));

            next(new HttpSuccess(201, {}));

            // now try to get the real certificate
            function getCertificateCallback(error) {
                if (error) {
                    console.error(error);
                    return setTimeout(that._getCertificate.bind(that, getCertificateCallback), 5000);
                }

                debug('_provision: success');
            }

            that._getCertificate(getCertificateCallback);
        });
    });
};

/*
    Middleware which makes the route require a password in the body besides a token.
*/
Server.prototype._requirePassword = function (req, res, next) {
    if (!req.body.password) return next(new HttpError(400, 'API call requires user password.'));
    next();
};


/*
    Middleware which makes the route only accessable for the admin user.
*/
Server.prototype._requireAdmin = function (req, res, next) {
    if (!req.user.admin) return next(new HttpError(403, 'API call requires the admin rights.'));
    next();
};

Server.prototype._initializeExpressSync = function () {
    this.app = express();

    var QUERY_LIMIT = '10mb', // max size for json and urlencoded queries
        FIELD_LIMIT = 2 * 1024, // max fields that can appear in multipart
        FILE_SIZE_LIMIT = '521mb', // max file size that can be uploaded
        UPLOAD_LIMIT = '521mb'; // catch all max size for any type of request

    var REQUEST_TIMEOUT = 10000, // timeout for all requests
        FILE_TIMEOUT = 3 * 60 * 1000; // increased timeout for file uploads (3 mins)

    var json = middleware.json({ strict: true, limit: QUERY_LIMIT }), // application/json
        urlencoded = middleware.urlencoded({ limit: QUERY_LIMIT }); // application/x-www-form-urlencoded

    // Passport configuration
    require('./auth');

    this.app.set('views', path.join(__dirname, 'oauth2views'));
    this.app.set('view options', { layout: true, debug: true });
    this.app.set('view engine', 'ejs');

    if (config.logApiRequests) {
        this.app.use(middleware.morgan({ format: 'dev', immediate: false }));
    }

    var router = new express.Router();
    router.del = router.delete; // amend router.del for readability further on

    this.app
//       .use(require('delay')(500))
       .use(middleware.timeout(REQUEST_TIMEOUT))
//       .use(express.limit(UPLOAD_LIMIT))
       .use(json)
       .use(urlencoded)
       .use(middleware.cookieParser())
       .use(middleware.favicon(__dirname + '/../assets/favicon.ico'))
       // API calls that do not require authorization
       .use(middleware.cors({ origins: [ '*' ], allowCredentials: true }))
       .use(middleware.session({ secret: 'yellow is blue' }))
       .use(passport.initialize())
       .use(passport.session())
       .use(router)
       .use(this._successHandler.bind(this))
       .use(this._clientErrorHandler.bind(this))
       .use(this._serverErrorHandler.bind(this));

    // middleware shortcuts for authentification
    var bearer = passport.authenticate(['bearer'], { session: false });
    var basic = passport.authenticate(['basic'], { session: false });
    var both = passport.authenticate(['basic', 'bearer'], { session: false });

    // scope middleware implicitly also adds bearer token verification
    var rootScope = routes.oauth2.scope('root');
    var profileScope = routes.oauth2.scope('profile');
    var usersScope = routes.oauth2.scope('users');
    var appsScope = routes.oauth2.scope('apps');
    var settingsScope = routes.oauth2.scope('settings');

    // middleware to ensure the calling user is admin
    var admin = this._requireAdmin.bind(this);

    // public routes
    router.get ('/api/v1/version', this._getVersion.bind(this));
    router.get ('/api/v1/firsttime', this._firstTime.bind(this));
    router.post('/api/v1/provision', this._provision.bind(this));
    router.post('/api/v1/restore', this._restore.bind(this));
    router.post('/api/v1/createadmin', routes.user.createAdmin);    // FIXME any number of admins can be created without auth!

    router.get ('/api/v1/config', rootScope, this._getConfig.bind(this));
    router.get ('/api/v1/update', rootScope, this._update.bind(this));
    router.get ('/api/v1/reboot', rootScope, this._reboot.bind(this));
    router.get ('/api/v1/stats', rootScope, this._getCloudronStats.bind(this));
    router.post('/api/v1/backups', rootScope, routes.backups.createBackup);
    router.get ('/api/v1/profile', profileScope, routes.user.info);

    router.get ('/api/v1/users', usersScope, routes.user.list);
    router.post('/api/v1/users', usersScope, admin, routes.user.create);
    router.get ('/api/v1/users/:userName', usersScope, routes.user.info);
    router.del ('/api/v1/users/:userName', usersScope, admin, routes.user.remove);
    router.post('/api/v1/users/:userName/password', usersScope, this._requirePassword.bind(this), routes.user.changePassword);
    router.post('/api/v1/users/:userName/admin', usersScope, admin, routes.user.changeAdmin);

    router.get ('/api/v1/users/:userName/login', basic, routes.user.createToken);    // TODO this should not be needed with OAuth
    router.get ('/api/v1/users/:userName/logout', bearer, routes.user.logout);       // TODO this should not be needed with OAuth

    // form based login routes used by oauth2 frame
    router.get ('/api/v1/session/login', routes.oauth2.loginForm);
    router.post('/api/v1/session/login', routes.oauth2.login);
    router.get ('/api/v1/session/logout', routes.oauth2.logout);
    router.get ('/api/v1/session/callback', routes.oauth2.callback);
    router.get ('/api/v1/session/error', routes.oauth2.error);

    // oauth2 routes
    router.get ('/api/v1/oauth/dialog/authorize', routes.oauth2.authorization);
    router.post('/api/v1/oauth/dialog/authorize/decision', routes.oauth2.decision);
    router.post('/api/v1/oauth/token', routes.oauth2.token);
    router.get ('/api/v1/oauth/yellowtent.js', routes.oauth2.library);

    // app routes
    router.get ('/api/v1/apps', appsScope, routes.apps.getApps);
    router.get ('/api/v1/app/:id', appsScope, routes.apps.getApp);
    router.post('/api/v1/app/:id/uninstall', appsScope, routes.apps.uninstallApp); // TODO does this require password?
    router.post('/api/v1/app/install', appsScope, this._requirePassword.bind(this), routes.apps.installApp);
    router.post('/api/v1/app/:id/configure', appsScope, this._requirePassword.bind(this), routes.apps.configureApp);
    router.post('/api/v1/app/:id/update', appsScope, routes.apps.updateApp);
    router.post('/api/v1/app/:id/stop', appsScope, routes.apps.stopApp);
    router.post('/api/v1/app/:id/start', appsScope, routes.apps.startApp);
    router.get ('/api/v1/app/:id/icon', routes.apps.getAppIcon);
    router.get ('/api/v1/app/:id/logs', routes.apps.getLogs);

    // subdomain routes
    router.get ('/api/v1/subdomains/:subdomain', routes.apps.getAppBySubdomain);

    // settings routes
    router.get ('/api/v1/settings/naked_domain', settingsScope, routes.settings.getNakedDomain);
    router.post('/api/v1/settings/naked_domain', settingsScope, routes.settings.setNakedDomain);


    // old syncer and file APIs, we might want to remove them soonish
    router.param('syncerVolume', function (req, res, next, id) {
        both(req, res, function (err) {
            if (err) return next(err);
            routes.sync.attachRepo(req, res, next, id);
        });
    });

    router.post('/api/v1/sync/:syncerVolume/diff', routes.sync.requireMountedVolume, routes.sync.diff);
    router.post('/api/v1/sync/:syncerVolume/delta', routes.sync.requireMountedVolume, routes.sync.delta);

    router.get ('/api/v1/revisions/:syncerVolume/*', routes.sync.requireMountedVolume, routes.file.revisions);
    router.get ('/api/v1/file/:syncerVolume/*', routes.sync.requireMountedVolume, routes.file.read);
    router.get ('/api/v1/metadata/:syncerVolume/*', routes.sync.requireMountedVolume, routes.file.metadata);
    router.put ('/api/v1/file/:syncerVolume/*', routes.sync.requireMountedVolume,
                                           routes.file.multipart({ maxFieldsSize: FIELD_LIMIT, limit: FILE_SIZE_LIMIT, timeout: FILE_TIMEOUT }),
                                           routes.file.putFile);

    router.post('/api/v1/fileops/:syncerVolume/copy', routes.sync.requireMountedVolume, routes.fileops.copy);
    router.post('/api/v1/fileops/:syncerVolume/move', routes.sync.requireMountedVolume, routes.fileops.move);
    router.post('/api/v1/fileops/:syncerVolume/delete', routes.sync.requireMountedVolume, routes.fileops.remove);
    router.post('/api/v1/fileops/:syncerVolume/create_dir', routes.sync.requireMountedVolume, routes.fileops.createDirectory);

    router.get ('/api/v1/volume/list', bearer, routes.volume.listVolumes);
    router.post('/api/v1/volume/create', bearer, this._requirePassword.bind(this), routes.volume.createVolume);

    // volume resource related routes
    router.param('volume', function (req, res, next, id) {
        both(req, res, function (err) {
            if (err) return next(err);
            routes.volume.attachVolume(req, res, next, id);
        });
    });
    router.get ('/api/v1/volume/:volume/list', routes.volume.requireMountedVolume, routes.volume.listFiles);
    router.get ('/api/v1/volume/:volume/list/*', routes.volume.requireMountedVolume, routes.volume.listFiles);
    router.post('/api/v1/volume/:volume/delete', this._requirePassword.bind(this), routes.volume.deleteVolume);
    router.post('/api/v1/volume/:volume/mount', this._requirePassword.bind(this), routes.volume.mount);
    router.post('/api/v1/volume/:volume/unmount', routes.volume.unmount);
    router.get ('/api/v1/volume/:volume/ismounted', routes.volume.isMounted);
    router.get ('/api/v1/volume/:volume/users', routes.volume.listUsers);
    router.post('/api/v1/volume/:volume/users', routes.volume.addUser);
    router.del ('/api/v1/volume/:volume/users/:username', routes.volume.removeUser);
};

Server.prototype._sendHeartBeat = function () {
    if (!config.appServerUrl) {
        debug('No appstore server url set. Not sending heartbeat.');
        return;
    }

    if (!config.token) {
        debug('No appstore server token set. Not sending heartbeat.');
        return;
    }

    var that = this;

    var url = config.appServerUrl + '/api/v1/boxes/' + os.hostname() + '/heartbeat';
    debug('Sending heartbeat ' + url);

    superagent.get(url).query({ token: config.token }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successfull');

        setTimeout(that._sendHeartBeat.bind(that), HEARTBEAT_INTERVAL);
    });
};

Server.prototype._getCertificate = function (callback) {
    assert(typeof callback === 'function');

    debug('_getCertificate');

    if (!config.appServerUrl || !config.token || !config.fqdn) {
        debug('_getCertificate: not provisioned, yet.');
        return callback(new Error('Not provisioned yet'));
    }

    var url = config.appServerUrl + '/api/v1/boxes/' + config.fqdn + '/certificate?token=' + config.token;

    var request = http;
    if (config.appServerUrl.indexOf('https://') === 0) request = https;

    request.get(url, function (result) {
        if (result.statusCode !== 200) return callback(new Error('Failed to get certificate. Status: ' + result.statusCode));

        var certDirPath = config.nginxCertDir;
        var certFilePath = path.join(certDirPath, 'cert.tar');
        var file = fs.createWriteStream(certFilePath);

        result.on('data', function (chunk) {
            file.write(chunk);
        });
        result.on('end', function () {
            require('child_process').exec('tar -xf ' + certFilePath, { cwd: certDirPath }, function(error) {
                if (error) return callback(error);

                if (!fs.existsSync(path.join(certDirPath, 'host.cert'))) return callback(new Error('Certificate bundle does not contain a host.cert file'));
                if (!fs.existsSync(path.join(certDirPath, 'host.info'))) return callback(new Error('Certificate bundle does not contain a host.info file'));
                if (!fs.existsSync(path.join(certDirPath, 'host.key'))) return callback(new Error('Certificate bundle does not contain a host.key file'));
                if (!fs.existsSync(path.join(certDirPath, 'host.pem'))) return callback(new Error('Certificate bundle does not contain a host.pem file'));

                // cleanup the cert bundle
                fs.unlinkSync(certFilePath);

                child_process.exec(RELOAD_NGINX_CMD, { timeout: 10000 }, function (error) {
                    if (error) return callback(error);

                    debug('_getCertificate: success');

                    callback(null);
                });
            });
        });
    }).on('error', function (error) {
        callback(error);
    });
};

Server.prototype._announce = function () {
    if (config.token) {
        debug('_announce: we already have a token. Skip announcing.');
        clearTimeout(this._announceTimerId);
        this._announceTimerId = null;
        return;
    }

    var that = this;

    var ANNOUNCE_INTERVAL = parseInt(process.env.ANNOUNCE_INTERVAL, 10) || 60000; // exported for testing

    // On Digital Ocean, the only value which we can give a new droplet is the hostname.
    // We use that value to identify the droplet by the appstore server when the droplet
    // announce itself. This identifier can look different for other box providers.
    var hostname = os.hostname();
    var url = config.appServerUrl + '/api/v1/boxes/' + hostname + '/announce';
    debug('_announce: box with %s.', url);

    superagent.get(url).end(function (error, result) {
        if (error || result.statusCode !== 200) {
            debug('_announce: unable to announce to app server, try again.', error);
            that._announceTimerId = setTimeout(that._announce.bind(that), ANNOUNCE_INTERVAL); // try again
            return;
        }

        that._announceTimerId = setTimeout(that._announce.bind(that), ANNOUNCE_INTERVAL * 2);

        debug('_announce: success');
    });
};

Server.prototype._scheduleBackup = function () {
    // every backup restarts the box. the setInterval is only needed should that fail for some reason
    this._backupTimerId = setInterval(backups.createBackup, 4 * 60 * 60 * 1000);
};

Server.prototype.start = function (callback) {
    assert(typeof callback === 'function');
    assert(this.app === null, 'Server is already up and running.');

    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);
    mkdirp.sync(config.nginxAppConfigDir);
    mkdirp.sync(config.appDataRoot);

    var that = this;

    this._updater = new Updater();

    this._initializeExpressSync();
    this._sendHeartBeat();

    this._announce();

    this._scheduleBackup();

    database.create(function (err) {
        if (err) return callback(err);

        apps.initialize();

        that._updater.start();

        that.httpServer = http.createServer(that.app);
        that.httpServer.listen(config.port, callback);
    });
};

Server.prototype.stop = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    if (!this.httpServer) {
        return callback(null);
    }

    that._updater.stop();

    clearTimeout(this._announceTimerId);
    this._announceTimerId = null;

    clearTimeout(this._backupTimerId);
    this._backupTimerId = null;

    apps.uninitialize();
    database.uninitialize();

    this.httpServer.close(function () {
        that.httpServer.unref();
        that.app = null;

        callback(null);
    });
};
