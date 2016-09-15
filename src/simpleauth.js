'use strict';

exports = module.exports = {
    start: start,
    stop: stop
};

var apps = require('./apps.js'),
    AppsError = apps.AppsError,
    assert = require('assert'),
    clients = require('./clients.js'),
    ClientsError = clients.ClientsError,
    config = require('./config.js'),
    constants = require('./constants.js'),
    DatabaseError = require('./databaseerror.js'),
    debug = require('debug')('box:src/simpleauth'),
    eventlog = require('./eventlog.js'),
    express = require('express'),
    http = require('http'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    middleware = require('./middleware'),
    tokendb = require('./tokendb.js'),
    user = require('./user.js'),
    UserError = require('./user.js').UserError;

var gHttpServer = null;

function loginLogic(clientId, username, password, callback) {
    assert.strictEqual(typeof clientId, 'string');
    assert.strictEqual(typeof username, 'string');
    assert.strictEqual(typeof password, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('login: client %s and user %s', clientId, username);

    clients.get(clientId, function (error, clientObject) {
        if (error) return callback(error);

        // only allow simple auth clients
        if (clientObject.type !== clients.TYPE_SIMPLE_AUTH) return callback(new ClientsError(ClientsError.INVALID_CLIENT));

        var authFunction = (username.indexOf('@') === -1) ? user.verifyWithUsername : user.verifyWithEmail;
        authFunction(username, password, function (error, userObject) {
            if (error) return callback(error);

            apps.get(clientObject.appId, function (error, appObject) {
                if (error) return callback(error);

                apps.hasAccessTo(appObject, userObject, function (error, access) {
                    if (error) return callback(error);
                    if (!access) return callback(new AppsError(AppsError.ACCESS_DENIED));

                    var accessToken = tokendb.generateToken();
                    var expires = Date.now() + constants.DEFAULT_TOKEN_EXPIRATION;

                    tokendb.add(accessToken, userObject.id, clientId, expires, clientObject.scope, function (error) {
                        if (error) return callback(error);

                        debug('login: new access token for client %s and user %s: %s', clientId, username, accessToken);

                        callback(null, { accessToken: accessToken, user: userObject });
                    });
                });
            });
        });
    });
}

function logoutLogic(accessToken, callback) {
    assert.strictEqual(typeof accessToken, 'string');
    assert.strictEqual(typeof callback, 'function');

    debug('logout: %s', accessToken);

    tokendb.del(accessToken, function (error) {
        if (error) return callback(error);
        callback(null);
    });
}

function login(req, res, next) {
    assert.strictEqual(typeof req.body, 'object');

    if (typeof req.body.clientId !== 'string') return next(new HttpError(400, 'clientId is required'));
    if (typeof req.body.username !== 'string') return next(new HttpError(400, 'username is required'));
    if (typeof req.body.password !== 'string') return next(new HttpError(400, 'password is required'));

    loginLogic(req.body.clientId, req.body.username, req.body.password, function (error, result) {
        if (error && error.reason === ClientsError.NOT_FOUND) return next(new HttpError(401, 'Unknown client'));
        if (error && error.reason === ClientsError.INVALID_CLIENT) return next(new HttpError(401, 'Unknown client'));
        if (error && error.reason === UserError.NOT_FOUND) return next(new HttpError(401, 'Forbidden'));
        if (error && error.reason === AppsError.NOT_FOUND) return next(new HttpError(401, 'Unknown app'));
        if (error && error.reason === UserError.WRONG_PASSWORD) return next(new HttpError(401, 'Forbidden'));
        if (error && error.reason === AppsError.ACCESS_DENIED) return next(new HttpError(401, 'Forbidden'));
        if (error) return next(new HttpError(500, error));

        eventlog.add(eventlog.ACTION_USER_LOGIN, { authType: 'simpleauth', clientId: req.body.clientId }, { userId: result.user.id });

        var tmp = {
            accessToken: result.accessToken,
            user: {
                id: result.user.id,
                username: result.user.username,
                email: result.user.email,
                admin: !!result.user.admin,
                displayName: result.user.displayName
            }
        };

        next(new HttpSuccess(200, tmp));
    });
}

function logout(req, res, next) {
    assert.strictEqual(typeof req.query, 'object');

    if (typeof req.query.access_token !== 'string') return next(new HttpError(400, 'access_token in query required'));

    logoutLogic(req.query.access_token, function (error) {
        if (error && error.reason === DatabaseError.NOT_FOUND) return next(new HttpError(401, 'Forbidden'));
        if (error) return next(new HttpError(500, error));

        next(new HttpSuccess(200, {}));
    });
}

function initializeExpressSync() {
    var app = express();
    var httpServer = http.createServer(app);

    httpServer.on('error', console.error);

    var json = middleware.json({ strict: true, limit: '100kb' });
    var router = new express.Router();

    // basic auth
    router.post('/api/v1/login', login);
    router.get ('/api/v1/logout', logout);

    if (process.env.BOX_ENV !== 'test') app.use(middleware.morgan('SimpleAuth :method :url :status :response-time ms - :res[content-length]', { immediate: false }));

    app
        .use(middleware.timeout(10000))
        .use(json)
        .use(router)
        .use(middleware.lastMile());

    return httpServer;
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');

    gHttpServer = initializeExpressSync();
    gHttpServer.listen(config.get('simpleAuthPort'), '0.0.0.0', callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (gHttpServer) gHttpServer.close(callback);
}
