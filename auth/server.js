'use strict';

var express = require('express'),
    http = require('http'),
    once = require('once'),
    passport = require('passport'),
    oauth2 = require('./oauth2'),
    site = require('./site'),
    user = require('./user'),
    HttpError = require('../api/httperror'),
    HttpSuccess = require('../api/httpsuccess'),
    middleware = require('../middleware/'),
    debug = require('debug')('main'),
    tokendb = require('./tokendb'),
    userdb = require('./userdb'),
    assert = require('assert');

module.exports = Server;

// this is not a middleware
function finishRequest(req, res, status, body, modified) {
    if (modified) res.set('last-modified', modified.toString());
    if (req.query.pretty !== 'true') res.send(status, JSON.stringify(body));
    else res.send(status, JSON.stringify(body, null, 4) + '\n');
}

// Success handler middleware
function successHandler(success, req, res, next) {
    if (success instanceof HttpSuccess) {
        debug('Send response with status', success.statusCode, 'and body', success.body);
        finishRequest(req, res, success.statusCode, success.body, success.modified);
    } else {
        next(success);
    }
}

// Error handlers. These are called until one of them sends headers
function clientErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode; // support both

    if (status >= 400 && status <= 499) {
        var obj = { status: http.STATUS_CODES[status], message: err.message };

        finishRequest(req, res, status, obj);

        debug(http.STATUS_CODES[status] + ' : ' + err.message);
        debug(err.stack);
    } else {
        next(err);
    }
}

function serverErrorHandler(err, req, res, next) {
    var status = err.status || err.statusCode || 500;
    var obj = { status: http.STATUS_CODES[status], message: err.message };

    finishRequest(req, res, status, obj);

    console.error(http.STATUS_CODES[status] + ' : ' + err.message);
    console.error(err.stack);
}

function Server(port, configDir, silent) {
    assert(typeof port === 'number');
    assert(typeof configDir === 'string');

    this._port = port;
    this._routePrefix = '/api/v1';
    this._silent = !!silent;
    this._configDir = configDir;

    this.app = null;
}

Server.prototype._initialize = function (callback) {
    var that = this;
    this.app = express();

    // routes.init();
    // auth.init();

    this.app.configure(function () {
        var QUERY_LIMIT = '1mb'; // max size for json and urlencoded queries
        var UPLOAD_LIMIT = '1mb'; // catch all max size for any type of request

        that.app.disable('x-powered-by');
        that.app.set('view engine', 'ejs');

        var json = express.json({ strict: true, limit: QUERY_LIMIT }); // application/json

        if (!that._silent) that.app.use(express.logger({ format: 'dev', immediate: false }));
        that.app.use(express.cookieParser());
        that.app.use(express.limit(UPLOAD_LIMIT));
        that.app.use(middleware.cors({ origins: [ '*' ], allowCredentials: true }));
        that.app.use(middleware.contentType('application/json; charset=utf-8'));
        that.app.use(express.session({ secret: 'yellow is blue' }));
        that.app.use(passport.initialize());
        that.app.use(passport.session());
        that.app.use(that.app.router);
        that.app.use(successHandler);
        that.app.use(clientErrorHandler);
        that.app.use(serverErrorHandler);

        // routes controlled by app.router
        require('./auth');

        that.app.get('/', site.index);
        that.app.get('/login', site.loginForm);
        that.app.post('/login', site.login);
        that.app.get('/logout', site.logout);
        that.app.get('/account', site.account);

        that.app.get('/dialog/authorize', oauth2.authorization);
        that.app.post('/dialog/authorize/decision', oauth2.decision);
        that.app.post('/oauth/token', oauth2.token);

        that.app.get('/api/userinfo', user.info);
    });

    this.app.set('port', that._port);

    callback(null);
};

Server.prototype._listen = function (callback) {
    this.app.httpServer = http.createServer(this.app);

    callback = once(callback);

    this.app.httpServer.listen(this.app.get('port'), function (error) {
        if (error) return callback(error);
        callback();
    });

    this.app.httpServer.on('error', function (error) {
        callback(error);
    });
};

// public API
Server.prototype.start = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    if (this.app) {
        return callback(new Error('Server is already up and running.'));
    }

    userdb.init(that._configDir, function (error) {
        if (error) return callback(error);

        tokendb.init(that._configDir, function (error) {
            if (error) return callback(error);

            that._initialize(function (error) {
                if (error) return callback(error);

                that._listen(callback);
            });
        });
    });
};

Server.prototype.stop = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    if (!this.app.httpServer) {
        return callback();
    }

    this.app.httpServer.close(function () {
        that.app.httpServer.unref();
        that.app = null;

        callback();
    });
};
