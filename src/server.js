/* jslint node: true */

'use strict';

var express = require('express'),
    http = require('http'),
    HttpError = require('./httperror.js'),
    HttpSuccess = require('./httpsuccess.js'),
    path = require('path'),
    passport = require('passport'),
    superagent = require('superagent'),
    mkdirp = require('mkdirp'),
    routes = require('./routes/index.js'),
    debug = require('debug')('box:server'),
    assert = require('assert'),
    pkg = require('./../package.json'),
    async = require('async'),
    apps = require('./apps'),
    middleware = require('./middleware'),
    database = require('./database.js'),
    DatabaseError = require('./databaseerror.js'),
    userdb = require('./userdb'),
    settingsdb = require('./settingsdb.js');

exports = module.exports = Server;

var HEARTBEAT_INTERVAL = 1000 * 60 * 60;

function Server(config) {
    assert(typeof config === 'object');

    this.config = config;
    this.httpServer = null; // http server
    this.app = null; // express
}

// Success handler
Server.prototype._successHandler = function (success, req, res, next) {
    // for now when we hit here, we always send json back
    res.setHeader('Content-Type', 'application/json');

    if (success instanceof HttpSuccess) {
        debug('Send response with status', success.statusCode, 'and body', success.body);
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
Server.prototype._firstTime = function (req, res, next) {
    userdb.count(function (error, count) {
        if (error) return res.send(500, { status: http.STATUS_CODES[500], message: error.message || 'Internal Server error' });

        return res.send(200, { activated: count !== 0, version: pkg.version });
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
Server.prototype._getVersion = function (req, res, next) {
    res.send(200, { version: pkg.version });
};

Server.prototype._getConfig = function (req, res, next) {
    res.send(200, {
        appstoreOrigin: this.config.appServerUrl,
        fqdn: this.config.fqdn
    });
};

Server.prototype._provision = function (req, res, next) {
    if (!req.body.token) return next(new HttpError(400, 'No token provided'));
    if (!req.body.appstoreOrigin) return next(new HttpError(400, 'No appstoreOrigin provided'));
    if (!req.body.adminOrigin) return next(new HttpError(400, 'No adminOrigin provided'));
    if (!req.body.fqdn) return next(new HttpError(400, 'No fqdn provided'));

    debug('_provision: received from appstore ' + req.body.appstoreOrigin);

    var that = this;

    settingsdb.get('token', function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return next(new HttpError(500));
        if (result) return next(new HttpError(409, 'Already provisioned'));

        async.each(['token', 'appstoreOrigin', 'adminOrigin', 'fqdn'], function (item, callback) {
            settingsdb.set(item, req.body[item], callback);
            that.config[item] = req.body[item];
        }, function (error) {
            if (error) return next(new HttpError(500, error));

            debug('_provision: success');

            next(new HttpSuccess(201, {}));
        });
    });
};

/*
    Middleware which makes the route require a password in the body besides a token.
*/
Server.prototype._requirePassword = function (req, res, next) {
    if (!req.body.password) return next(new HttpError(400, 'API call requires the users password.'));
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

    if (!this.config.silent) {
        this.app.use(middleware.morgan({ format: 'dev', immediate: false }));
    }

    var router = new express.Router();

    this.app
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

       // FIXME
       // temporarily accept both
       //  - [query] auth_token and access_token
       //  - [header] 'Token <tok>' and 'Bearer <tok>'
       // see http://tools.ietf.org/html/rfc6750
       .use(function (req, res, next) {
            if (req.query.auth_token) req.query.access_token = req.query.auth_token;
            var auth = req.headers.authorization;
            if (auth && auth.indexOf('Token ') === 0) {
                req.headers.authorization = 'Bearer ' + auth.slice('Token '.length);
            }
            next();
       })

       .use(router)
       .use(this._successHandler.bind(this))
       .use(this._clientErrorHandler.bind(this))
       .use(this._serverErrorHandler.bind(this));

    var bearer = passport.authenticate(['bearer'], { session: false });
    var basic = passport.authenticate(['basic'], { session: false });
    var both = passport.authenticate(['basic', 'bearer'], { session: false });

    // public routes
    router.get('/api/v1/version', this._getVersion.bind(this));
    router.get('/api/v1/firsttime', this._firstTime.bind(this));
    router.post('/api/v1/provision', this._provision.bind(this));    // FIXME any number of admins can be created without auth!
    router.post('/api/v1/createadmin', routes.user.createAdmin);    // FIXME any number of admins can be created without auth!

    // config.json
    router.get('/api/v1/config', bearer, this._getConfig.bind(this));

    // routes controlled by app.router
    router.post('/api/v1/token', both, routes.user.createToken);        // TODO remove that route
    router.get('/api/v1/user/token', bearer, routes.user.createToken);
    router.get('/api/v1/logout', bearer, routes.user.logout);             // TODO remove that route
    router.get('/api/v1/user/logout', bearer, routes.user.logout);
    router.post('/api/v1/user/create', bearer, this._requireAdmin.bind(this), routes.user.create);
    router.post('/api/v1/user/remove', bearer, this._requireAdmin.bind(this), routes.user.remove);
    router.post('/api/v1/user/password', bearer, this._requirePassword.bind(this), routes.user.changePassword);
    router.get('/api/v1/user/info', bearer, routes.user.info);
    router.get('/api/v1/user/list', bearer, routes.user.list);

    router.param('syncerVolume', function (req, res, next, id) {
        both(req, res, function (err) {
            if (err) return next(err);
            routes.sync.attachRepo(req, res, next, id);
        });
    });

    router.post('/api/v1/sync/:syncerVolume/diff', routes.sync.requireMountedVolume, routes.sync.diff);
    router.post('/api/v1/sync/:syncerVolume/delta', routes.sync.requireMountedVolume, routes.sync.delta);

    router.get('/api/v1/revisions/:syncerVolume/*', routes.sync.requireMountedVolume, routes.file.revisions);
    router.get('/api/v1/file/:syncerVolume/*', routes.sync.requireMountedVolume, routes.file.read);
    router.get('/api/v1/metadata/:syncerVolume/*', routes.sync.requireMountedVolume, routes.file.metadata);
    router.put('/api/v1/file/:syncerVolume/*', routes.sync.requireMountedVolume,
                                           routes.file.multipart({ maxFieldsSize: FIELD_LIMIT, limit: FILE_SIZE_LIMIT, timeout: FILE_TIMEOUT }),
                                           routes.file.putFile);

    router.post('/api/v1/fileops/:syncerVolume/copy', routes.sync.requireMountedVolume, routes.fileops.copy);
    router.post('/api/v1/fileops/:syncerVolume/move', routes.sync.requireMountedVolume, routes.fileops.move);
    router.post('/api/v1/fileops/:syncerVolume/delete', routes.sync.requireMountedVolume, routes.fileops.remove);
    router.post('/api/v1/fileops/:syncerVolume/create_dir', routes.sync.requireMountedVolume, routes.fileops.createDirectory);

    router.get('/api/v1/volume/list', bearer, routes.volume.listVolumes);
    router.post('/api/v1/volume/create', bearer, this._requirePassword.bind(this), routes.volume.createVolume);

    // volume resource related routes
    router.param('volume', function (req, res, next, id) {
        both(req, res, function (err) {
            if (err) return next(err);
            routes.volume.attachVolume(req, res, next, id);
        });
    });
    router.get('/api/v1/volume/:volume/list', routes.volume.requireMountedVolume, routes.volume.listFiles);
    router.get('/api/v1/volume/:volume/list/*', routes.volume.requireMountedVolume, routes.volume.listFiles);
    router.post('/api/v1/volume/:volume/delete', this._requirePassword.bind(this), routes.volume.deleteVolume);
    router.post('/api/v1/volume/:volume/mount', this._requirePassword.bind(this), routes.volume.mount);
    router.post('/api/v1/volume/:volume/unmount', routes.volume.unmount);
    router.get('/api/v1/volume/:volume/ismounted', routes.volume.isMounted);
    router.get('/api/v1/volume/:volume/users', routes.volume.listUsers);
    router.post('/api/v1/volume/:volume/users', routes.volume.addUser);
    router.delete('/api/v1/volume/:volume/users/:username', routes.volume.removeUser);

    // form based login routes used by oauth2 frame
    router.get('/api/v1/session/login', routes.oauth2.loginForm);
    router.post('/api/v1/session/login', routes.oauth2.login);
    router.get('/api/v1/session/logout', routes.oauth2.logout);
    router.get('/api/v1/session/callback', routes.oauth2.callback);
    router.get('/api/v1/session/account', routes.oauth2.account); // TODO this is only temporary

    // oauth2 routes
    router.get('/api/v1/oauth/dialog/authorize', routes.oauth2.authorization);
    router.post('/api/v1/oauth/dialog/authorize/decision', routes.oauth2.decision);
    router.post('/api/v1/oauth/token', routes.oauth2.token);
    router.get('/api/v1/oauth/yellowtent.js', routes.oauth2.library);

    // app routes
    router.get('/api/v1/apps', bearer, routes.apps.getApps);
    router.get('/api/v1/app/:id', bearer, routes.apps.getApp);
    router.post('/api/v1/app/:id/uninstall', bearer, routes.apps.uninstallApp); // TODO does this require password?
    router.post('/api/v1/app/install', bearer, this._requirePassword.bind(this), routes.apps.installApp);

    // subdomain routes
    router.get('/api/v1/subdomain/:subdomain', routes.apps.getAppBySubdomain); // TODO: allow non-authenticated for the appstatus page

    // settings routes
    router.get('/api/v1/settings/naked_domain', bearer, routes.settings.getNakedDomain);
    router.post('/api/v1/settings/naked_domain', bearer, routes.settings.setNakedDomain);
};

Server.prototype._initialize2 = function (callback) {
    var config = this.config;

    var that = this;

    // ensure data/config/mount paths
    mkdirp.sync(config.dataRoot);
    mkdirp.sync(config.configRoot);
    mkdirp.sync(config.mountRoot);
    mkdirp.sync(config.nginxAppConfigDir);
    mkdirp.sync(config.appDataRoot);

    async.series([
        database.create.bind(null, config),
        database.initialize.bind(null, config),
        function initializeRoutes(callback) {
            routes.volume.initialize(config);
            routes.sync.initialize(config);
            routes.user.initialize(config);
            routes.apps.initialize(config);
            routes.oauth2.initialize(config);
            callback(null);
        },
        function initializeModules(callback) {
            apps.initialize();
            callback(null);
        },
    ], callback);
};

Server.prototype._sendHeartBeat = function () {
    if (!this.config.appServerUrl) {
        debug('No appstore server url set. Not sending heartbeat.');
        return;
    }

    if (!this.config.token) {
        debug('No appstore server token set. Not sending heartbeat.');
        return;
    }

    var that = this;

    var url = this.config.appServerUrl + '/api/v1/boxes/heartbeat';
    debug('Sending heartbeat ' + url);

    superagent.get(url).query({ token: this.config.token }).end(function (error, result) {
        if (error) debug('Error sending heartbeat.', error);
        else if (result.statusCode !== 200) debug('Server responded to heartbeat with ' + result.statusCode);
        else debug('Heartbeat successfull');

        setTimeout(that._sendHeartBeat.bind(that), HEARTBEAT_INTERVAL);
    });
};

Server.prototype.announce = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    settingsdb.get('token', function (error, result) {
        if (error && error.reason !== DatabaseError.NOT_FOUND) return callback(error);
        if (result) return callback(null);

        debug('announce: first run, try to provision the box by announcing with appstore.');

        var url = that.config.appServerUrl + '/api/v1/boxes/announce';
        debug('announce: ' + url + ' with box name ' + that.config.fqdn);

        superagent.get(url).query({ name: that.config.fqdn }).end(function (error, result) {
            if (error) return callback(error);
            if (result.statusCode !== 200) return callback(new Error('Unable to announce box with appstore'));

            debug('announce: success');

            callback(null);
        });
    });
};

Server.prototype.start = function (callback) {
    assert(typeof callback === 'function');
    assert(this.app === null, 'Server is already up and running.');

    var that = this;

    this._initializeExpressSync();
    this._sendHeartBeat();

    if (process.env.NODE_ENV !== 'production') {
        console.warn('WARNING: Express is running in ' + process.env.NODE_ENV + ' mode');
    }

    this._initialize2(function (err) {
        if (err) return callback(err);

        settingsdb.getAll(function (error, result) {
            if (error) return callback(error);

            debug('start: settings', result);

            result.forEach(function (item) {
                that.config[item] = item.value;
            });

            that.httpServer = http.createServer(that.app);

            that.httpServer.listen(that.config.port, callback);
        });
    });
};

Server.prototype.stop = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    if (!this.httpServer) {
        return callback(null);
    }

    apps.uninitialize();

    this.httpServer.close(function () {
        that.httpServer.unref();
        that.app = null;

        callback(null);
    });
};
