'use strict';

var express = require('express'),
    http = require('http'),
    HttpError = require('../common/httperror'),
    HttpSuccess = require('../common/httpsuccess'),
    path = require('path'),
    fs = require('fs'),
    mkdirp = require('mkdirp'),
    db = require('../auth/database.js'),
    routes = require('./routes/index.js'),
    debug = require('debug')('server:server'),
    assert = require('assert'),
    util = require('util'),
    pkg = require('./../package.json');

exports = module.exports = Server;

function Server(config) {
    assert(typeof config === 'object');

    this.config = config;
    this.app = null;
}


// Success handler
Server.prototype._successHandler = function (success, req, res, next) {
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
    res.send(status, { status: http.STATUS_CODES[status], message: err.message });
    console.error(http.STATUS_CODES[status] + ' : ' + err.message);
    console.error(err.stack);
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

Server.prototype._loadMiddleware = function () {
    var middleware = { };
    // TODO that folder lookup is a bit silly maybe with the '../' - Johannes
    fs.readdirSync(__dirname + '/../middleware').forEach(function (filename) {
        if (!/\.js$/.test(filename)) return;
        var name = path.basename(filename, '.js');
        function load() { return require('./../middleware/' + name); }
        middleware.__defineGetter__(name, load);
    });
    return middleware;
};

Server.prototype._initialize = function (callback) {
    var that = this;
    var middleware = this._loadMiddleware();
    this.app = express();

    this.app.configure(function () {
        var QUERY_LIMIT = '10mb', // max size for json and urlencoded queries
            FIELD_LIMIT = 2 * 1024, // max fields that can appear in multipart
            FILE_SIZE_LIMIT = '521mb', // max file size that can be uploaded
            UPLOAD_LIMIT = '521mb'; // catch all max size for any type of request

        var REQUEST_TIMEOUT = 10000, // timeout for all requests
            FILE_TIMEOUT = 3 * 60 * 1000; // increased timeout for file uploads (3 mins)

        var json = express.json({ strict: true, limit: QUERY_LIMIT }), // application/json
            urlencoded = express.urlencoded({ limit: QUERY_LIMIT }); // application/x-www-form-urlencoded

        if (!that.config.silent) {
            that.app.use(express.logger({ format: 'dev', immediate: false }));
        }

        that.app
           .use(express.timeout(REQUEST_TIMEOUT))
           .use(express.limit(UPLOAD_LIMIT))
           .use(json)
           .use(urlencoded)
           .use(express.cookieParser())
           // API calls that do not require authorization
           .use(middleware.cors({ origins: [ '*' ], allowCredentials: true }))
           .use(middleware.contentType('application/json'))
           .use('/api/v1/createadmin', routes.user.createAdmin) // ## FIXME: allow this before auth for now
           .use(routes.user.authenticate)
           .use(that.app.router)
           .use(that._successHandler.bind(that))
           .use(that._clientErrorHandler.bind(that))
           .use(that._serverErrorHandler.bind(that));

        // routes controlled by app.router
        that.app.post('/api/v1/token', routes.user.createToken);        // TODO remove that route
        that.app.get('/api/v1/user/token', routes.user.createToken);
        that.app.get('/api/v1/logout', routes.user.logout);             // TODO remove that route
        that.app.get('/api/v1/user/logout', routes.user.logout);
        that.app.post('/api/v1/user/create', that._requireAdmin.bind(that), routes.user.create);
        that.app.post('/api/v1/user/remove', that._requireAdmin.bind(that), routes.user.remove);
        that.app.post('/api/v1/user/password', that._requirePassword.bind(that), routes.user.changePassword);
        that.app.get('/api/v1/user/info', routes.user.info);
        that.app.get('/api/v1/user/list', routes.user.list);

        that.app.param('volume', routes.volume.attachVolume);

        that.app.get('/api/v1/volume/:volume/list', routes.volume.requireMountedVolume, routes.volume.listFiles);
        that.app.get('/api/v1/volume/:volume/list/*', routes.volume.requireMountedVolume, routes.volume.listFiles);
        that.app.get('/api/v1/volume/list', routes.volume.listVolumes);
        that.app.post('/api/v1/volume/create', that._requirePassword.bind(that), routes.volume.createVolume);
        that.app.post('/api/v1/volume/:volume/delete', that._requirePassword.bind(that), routes.volume.deleteVolume);
        that.app.post('/api/v1/volume/:volume/mount', that._requirePassword.bind(that), routes.volume.mount);
        that.app.post('/api/v1/volume/:volume/unmount', routes.volume.unmount);
        that.app.get('/api/v1/volume/:volume/ismounted', routes.volume.isMounted);
        that.app.get('/api/v1/volume/:volume/users', routes.volume.listUsers);
        that.app.post('/api/v1/volume/:volume/users', routes.volume.addUser);
        that.app.del('/api/v1/volume/:volume/users/:username', routes.volume.removeUser);
    });

    this.app.set('port', that.config.port);

    if (!that.config.silent) {
        console.log('Server listening on port ' + this.app.get('port'));
        console.log('Using data root:', that.config.dataRoot);
        console.log('Using config root:', that.config.configRoot);
        console.log('Using mount root:', that.config.mountRoot);
    }

    // ensure data/config/mount paths
    mkdirp.sync(that.config.dataRoot);
    mkdirp.sync(that.config.configRoot);
    mkdirp.sync(that.config.mountRoot);

    if (!db.initialize(that.config)) {
        return callback(new Error('Error initializing database'));
    }

    routes.volume.initialize(that.config);
    routes.user.initialize(that.config);

    callback(null);
};

// TODO maybe we can get rid of that function and inline it - Johannes
Server.prototype._listen = function (callback) {
    this.app.httpServer = http.createServer(this.app);

    function callbackWrapper(error) {
        if (callback) {
            callback(error);
            callback = null;
        } else {
            console.error('Try to call back twice', error);
        }
    }

    this.app.httpServer.listen(this.app.get('port'), function (err) {
        if (err) return callbackWrapper(err);
        callbackWrapper();
    });

    this.app.httpServer.on('error', function (err) {
        callbackWrapper(err);
    });
};

Server.prototype.start = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    if (this.app) {
        return callback(new Error('Server is already up and running.'));
    }

    this._initialize(function (err) {
        if (err) return callback(err);

        that._listen(function (err) {
            if (err) return callback(err);

            callback(null);
        });
    });
};

Server.prototype.stop = function (callback) {
    // Any other way to check if app is an object we expect?
    assert(typeof callback === 'function');

    var that = this;

    if (!this.app.httpServer) {
        return callback();
    }

    this.app.httpServer.close(function () {
        that.app.httpServer.unref();
        // TODO should delete the app variable
        that.app = null;

        callback();
    });
};
