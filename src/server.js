/* jslint node: true */

'use strict';

var apps = require('./apps'),
    assert = require('assert'),
    async = require('async'),
    auth = require('./auth.js'),
    cloudron = require('./cloudron.js'),
    config = require('../config.js'),
    database = require('./database.js'),
    debug = require('debug')('box:server'),
    express = require('express'),
    http = require('http'),
    HttpError = require('connect-lastmile').HttpError,
    HttpSuccess = require('connect-lastmile').HttpSuccess,
    mailer = require('./mailer.js'),
    middleware = require('../middleware'),
    mkdirp = require('mkdirp'),
    passport = require('passport'),
    path = require('path'),
    paths = require('./paths.js'),
    routes = require('./routes/index.js'),
    updater = require('./updater.js');

var gHttpServer = null,
    gApp = null;

exports = module.exports = {
    start: start,
    stop: stop
};

function initializeExpressSync() {
    gApp = express();

    var QUERY_LIMIT = '10mb', // max size for json and urlencoded queries
        FIELD_LIMIT = 2 * 1024; // max fields that can appear in multipart

    var REQUEST_TIMEOUT = 10000; // timeout for all requests

    var json = middleware.json({ strict: true, limit: QUERY_LIMIT }), // application/json
        urlencoded = middleware.urlencoded({ extended: false, limit: QUERY_LIMIT }), // application/x-www-form-urlencoded
        csrf = middleware.csrf(); // Cross-site request forgery protection middleware for login form

    gApp.set('views', path.join(__dirname, 'oauth2views'));
    gApp.set('view options', { layout: true, debug: true });
    gApp.set('view engine', 'ejs');

    if (process.env.NODE_ENV === 'test') {
       gApp.use(express.static(path.join(__dirname, '/../webadmin')));
    } else {
        gApp.use(middleware.morgan({ format: 'dev', immediate: false }));
    }

    var router = new express.Router();
    router.del = router.delete; // amend router.del for readability further on

    gApp
       .use(middleware.timeout(REQUEST_TIMEOUT))
       .use(json)
       .use(urlencoded)
       .use(middleware.cookieParser())
       .use(middleware.favicon(__dirname + '/../assets/favicon.ico'))
       .use(middleware.cors({ origins: [ '*' ], allowCredentials: true }))
       .use(middleware.session({ secret: 'yellow is blue' }))
       .use(passport.initialize())
       .use(passport.session())
       .use(router)
       .use(middleware.lastMile());

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

    // public routes
    router.post('/api/v1/cloudron/activate', routes.cloudron.activate);    // FIXME any number of admins can be created without auth!

    router.get ('/api/v1/cloudron/status', routes.cloudron.getStatus); // public route
    router.get ('/api/v1/cloudron/config', rootScope, routes.cloudron.getConfig);
    router.get ('/api/v1/cloudron/update', rootScope, routes.cloudron.update);
    router.get ('/api/v1/cloudron/reboot', rootScope, routes.cloudron.reboot);
    router.get ('/api/v1/cloudron/stats', rootScope, routes.cloudron.getStats);
    router.post('/api/v1/cloudron/backups', rootScope, routes.cloudron.createBackup);
    router.get ('/api/v1/cloudron/graphs', rootScope, routes.graphs.getGraphs);

    router.get ('/api/v1/profile', profileScope, routes.user.info); // FIXME how is this different from info route below?

    router.get ('/api/v1/users', usersScope, routes.user.list);
    router.post('/api/v1/users', usersScope, routes.user.requireAdmin, routes.user.create);
    router.get ('/api/v1/users/:userName', usersScope, routes.user.info);
    router.del ('/api/v1/users/:userName', usersScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.user.remove);
    router.post('/api/v1/users/:userName/password', usersScope, routes.user.changePassword); // changePassword verifies password
    router.post('/api/v1/users/:userName/admin', usersScope, routes.user.requireAdmin, routes.user.changeAdmin);

    router.get ('/api/v1/users/:userName/login', basic, routes.user.createToken);    // FIXME this should not be needed with OAuth
    router.get ('/api/v1/users/:userName/logout', bearer, routes.user.logout);       // FIXME this should not be needed with OAuth

    // form based login routes used by oauth2 frame
    router.get ('/api/v1/session/login', csrf, routes.oauth2.loginForm);
    router.post('/api/v1/session/login', csrf, routes.oauth2.login);
    router.get ('/api/v1/session/logout', routes.oauth2.logout);
    router.get ('/api/v1/session/callback', routes.oauth2.callback);
    router.get ('/api/v1/session/error', routes.oauth2.error);
    router.get ('/api/v1/session/password/resetRequest.html', csrf, routes.oauth2.passwordResetRequestSite);
    router.post('/api/v1/session/password/resetRequest', csrf, routes.oauth2.passwordResetRequest);
    router.get ('/api/v1/session/password/sent.html', routes.oauth2.passwordSentSite);
    router.get ('/api/v1/session/password/reset.html', csrf, routes.oauth2.passwordResetSite);
    router.post('/api/v1/session/password/reset', csrf, routes.oauth2.passwordReset);

    // oauth2 routes
    router.get ('/api/v1/oauth/dialog/authorize', routes.oauth2.authorization);
    router.post('/api/v1/oauth/dialog/authorize/decision', csrf, routes.oauth2.decision);
    router.post('/api/v1/oauth/token', routes.oauth2.token);
    router.get ('/api/v1/oauth/yellowtent.js', routes.oauth2.library);
    router.get ('/api/v1/oauth/clients', settingsScope, routes.oauth2.getClients);
    router.get ('/api/v1/oauth/clients/:clientId/tokens', settingsScope, routes.oauth2.getClientTokens);
    router.del ('/api/v1/oauth/clients/:clientId/tokens', settingsScope, routes.oauth2.delClientTokens);
    router.all ('/api/v1/oauth/proxy*', csrf, routes.oauth2.applicationProxy);

    // app routes
    router.get ('/api/v1/apps', appsScope, routes.apps.getApps);
    router.get ('/api/v1/apps/:id', appsScope, routes.apps.getApp);
    router.post('/api/v1/apps/:id/uninstall', appsScope, routes.apps.uninstallApp); // FIXME does this require password?
    router.post('/api/v1/apps/install', appsScope, routes.user.verifyPassword, routes.apps.installApp);
    router.post('/api/v1/apps/:id/configure', appsScope, routes.user.verifyPassword, routes.apps.configureApp);
    router.post('/api/v1/apps/:id/update', appsScope, routes.apps.updateApp);
    router.post('/api/v1/apps/:id/stop', appsScope, routes.apps.stopApp);
    router.post('/api/v1/apps/:id/start', appsScope, routes.apps.startApp);
    router.get ('/api/v1/apps/:id/icon', routes.apps.getAppIcon);
    router.get ('/api/v1/apps/:id/logstream', appsScope, routes.apps.getLogStream);
    router.get ('/api/v1/apps/:id/logs', appsScope, routes.apps.getLogs);

    // subdomain routes
    router.get ('/api/v1/subdomains/:subdomain', routes.apps.getAppBySubdomain);

    // settings routes
    router.get ('/api/v1/settings/naked_domain', settingsScope, routes.settings.getNakedDomain);
    router.post('/api/v1/settings/naked_domain', settingsScope, routes.settings.setNakedDomain);

    // graphite calls (FIXME: remove before release)
    router.get([ '/graphite/*', '/content/*', '/metrics/*', '/dashboard/*', '/render/*', '/browser/*', '/composer/*' ], routes.graphs.forwardToGraphite);
}

function start(callback) {
    assert(typeof callback === 'function');
    assert(gApp === null, 'Server is already up and running.');

    mkdirp.sync(paths.APPICONS_DIR);
    mkdirp.sync(paths.NGINX_APPCONFIG_DIR);
    mkdirp.sync(paths.APPDATA_DIR);
    mkdirp.sync(paths.COLLECTD_APPCONFIG_DIR);
    mkdirp.sync(paths.HARAKA_CONFIG_DIR);

    initializeExpressSync();

    gHttpServer = http.createServer(gApp);

    async.series([
        auth.initialize,
        database.initialize,
        apps.initialize,
        cloudron.initialize,
        updater.initialize,
        mailer.initialize,
        gHttpServer.listen.bind(gHttpServer, config.get('port'), '127.0.0.1')
    ], callback);
}

function stop(callback) {
    assert(typeof callback === 'function');

    if (!gHttpServer) return callback(null);

    async.series([
        auth.uninitialize,
        cloudron.uninitialize,
        updater.uninitialize,
        apps.uninitialize,
        mailer.uninitialize,
        database.uninitialize,
        gHttpServer.close.bind(gHttpServer)
    ], function (error) {
        if (error) console.error(error);

        gApp = null;

        callback(null);
    });
}
