/* jslint node: true */

'use strict';

exports = module.exports = {
    start: start,
    stop: stop
};

var assert = require('assert'),
    async = require('async'),
    auth = require('./auth.js'),
    cloudron = require('./cloudron.js'),
    cron = require('./cron.js'),
    config = require('../config.js'),
    database = require('./database.js'),
    express = require('express'),
    http = require('http'),
    mailer = require('./mailer.js'),
    middleware = require('./middleware'),
    passport = require('passport'),
    path = require('path'),
    routes = require('./routes/index.js'),
    taskmanager = require('./taskmanager.js'),
    updater = require('./updater.js');

var gHttpServer = null;
var gInternalHttpServer = null;

function initializeExpressSync() {
    var app = express();
    var httpServer = http.createServer(app);

    var QUERY_LIMIT = '10mb', // max size for json and urlencoded queries
        FIELD_LIMIT = 2 * 1024 * 1024; // max fields that can appear in multipart

    var REQUEST_TIMEOUT = 10000; // timeout for all requests

    var json = middleware.json({ strict: true, limit: QUERY_LIMIT }), // application/json
        urlencoded = middleware.urlencoded({ extended: false, limit: QUERY_LIMIT }); // application/x-www-form-urlencoded

    app.set('views', path.join(__dirname, 'oauth2views'));
    app.set('view options', { layout: true, debug: true });
    app.set('view engine', 'ejs');

    if (process.env.NODE_ENV === 'test') {
       app.use(express.static(path.join(__dirname, '/../webadmin')));
    } else {
        app.use(middleware.morgan('dev', { immediate: false }));
    }

    var router = new express.Router();
    router.del = router.delete; // amend router.del for readability further on

    app
       .use(middleware.timeout(REQUEST_TIMEOUT))
       .use(json)
       .use(urlencoded)
       .use(middleware.cookieParser())
       .use(middleware.favicon(__dirname + '/../assets/favicon.ico'))
       .use(middleware.cors({ origins: [ '*' ], allowCredentials: true }))
       .use(middleware.session({ secret: 'yellow is blue', resave: true, saveUninitialized: true, cookie: { path: '/', httpOnly: true, secure: false, maxAge: 600000 } }))
       .use(passport.initialize())
       .use(passport.session())
       .use(router)
       .use(middleware.lastMile());

    var FILE_SIZE_LIMIT = '521mb', // max file size that can be uploaded
        FILE_TIMEOUT = 60 * 1000; // increased timeout for file uploads (1 min)

    var multipart = middleware.multipart({ maxFieldsSize: FIELD_LIMIT, limit: FILE_SIZE_LIMIT, timeout: FILE_TIMEOUT });

    // scope middleware implicitly also adds bearer token verification
    var rootScope = routes.oauth2.scope('root');
    var profileScope = routes.oauth2.scope('profile');
    var usersScope = routes.oauth2.scope('users');
    var appsScope = routes.oauth2.scope('apps');
    var developerScope = routes.oauth2.scope('developer');
    var settingsScope = routes.oauth2.scope('settings');

    // csrf protection
    var csrf = routes.oauth2.csrf;

    // public routes
    router.post('/api/v1/cloudron/activate', routes.cloudron.setupTokenAuth, routes.cloudron.activate);
    router.get ('/api/v1/cloudron/progress', routes.cloudron.getProgress);
    router.get ('/api/v1/cloudron/status', routes.cloudron.getStatus);

    // developer routes
    router.post('/api/v1/developer', developerScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.developer.setEnabled);
    router.get ('/api/v1/developer', developerScope, routes.developer.enabled, routes.developer.status);
    router.post('/api/v1/developer/login', routes.developer.enabled, routes.developer.login);

    // private routes
    router.get ('/api/v1/cloudron/config', rootScope, routes.cloudron.getConfig);
    router.post('/api/v1/cloudron/update', rootScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.cloudron.update);
    router.get ('/api/v1/cloudron/reboot', rootScope, routes.cloudron.reboot);
    router.post('/api/v1/cloudron/migrate', rootScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.cloudron.migrate);
    router.post('/api/v1/cloudron/certificate', rootScope, multipart, routes.cloudron.setCertificate);
    router.get ('/api/v1/cloudron/graphs', rootScope, routes.graphs.getGraphs);

    router.get ('/api/v1/profile', profileScope, routes.user.profile);

    router.get ('/api/v1/users', usersScope, routes.user.list);
    router.post('/api/v1/users', usersScope, routes.user.requireAdmin, routes.user.create);
    router.get ('/api/v1/users/:userId', usersScope, routes.user.info);
    router.put ('/api/v1/users/:userId', usersScope, routes.user.verifyPassword, routes.user.update);
    router.del ('/api/v1/users/:userId', usersScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.user.remove);
    router.post('/api/v1/users/:userId/password', usersScope, routes.user.changePassword); // changePassword verifies password
    router.post('/api/v1/users/:userId/admin', usersScope, routes.user.requireAdmin, routes.user.changeAdmin);

    // form based login routes used by oauth2 frame
    router.get ('/api/v1/session/login', csrf, routes.oauth2.loginForm);
    router.post('/api/v1/session/login', csrf, routes.oauth2.login);
    router.get ('/api/v1/session/logout', routes.oauth2.logout);
    router.get ('/api/v1/session/callback', routes.oauth2.callback);
    router.get ('/api/v1/session/error', routes.oauth2.error);
    router.get ('/api/v1/session/password/resetRequest.html', csrf, routes.oauth2.passwordResetRequestSite);
    router.post('/api/v1/session/password/resetRequest', csrf, routes.oauth2.passwordResetRequest);
    router.get ('/api/v1/session/password/sent.html', routes.oauth2.passwordSentSite);
    router.get ('/api/v1/session/password/setup.html', csrf, routes.oauth2.passwordSetupSite);
    router.get ('/api/v1/session/password/reset.html', csrf, routes.oauth2.passwordResetSite);
    router.post('/api/v1/session/password/reset', csrf, routes.oauth2.passwordReset);

    // oauth2 routes
    router.get ('/api/v1/oauth/dialog/authorize', routes.oauth2.authorization);
    router.post('/api/v1/oauth/dialog/authorize/decision', csrf, routes.oauth2.decision);
    router.post('/api/v1/oauth/token', routes.oauth2.token);
    router.get ('/api/v1/oauth/clients', settingsScope, routes.clients.getAllByUserId);
    router.post('/api/v1/oauth/clients', routes.developer.enabled, settingsScope, routes.clients.add);
    router.get ('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.get);
    router.post('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.add);
    router.put ('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.update);
    router.del ('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.del);
    router.get ('/api/v1/oauth/clients/:clientId/tokens', settingsScope, routes.clients.getClientTokens);
    router.del ('/api/v1/oauth/clients/:clientId/tokens', settingsScope, routes.clients.delClientTokens);

    // app routes
    router.get ('/api/v1/apps',          appsScope, routes.apps.getApps);
    router.get ('/api/v1/apps/:id',      appsScope, routes.apps.getApp);
    router.get ('/api/v1/apps/:id/icon', appsScope, routes.apps.getAppIcon);

    router.post('/api/v1/apps/install',       appsScope, routes.user.requireAdmin, routes.apps.installApp);
    router.post('/api/v1/apps/:id/uninstall', appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.uninstallApp);
    router.post('/api/v1/apps/:id/configure', appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.configureApp);
    router.post('/api/v1/apps/:id/update',    appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.updateApp);
    router.post('/api/v1/apps/:id/restore',   appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.restoreApp);
    router.post('/api/v1/apps/:id/backup',    appsScope, routes.user.requireAdmin, routes.apps.backupApp);
    router.post('/api/v1/apps/:id/stop',      appsScope, routes.user.requireAdmin, routes.apps.stopApp);
    router.post('/api/v1/apps/:id/start',     appsScope, routes.user.requireAdmin, routes.apps.startApp);
    router.get ('/api/v1/apps/:id/logstream', appsScope, routes.user.requireAdmin, routes.apps.getLogStream);
    router.get ('/api/v1/apps/:id/logs',      appsScope, routes.user.requireAdmin, routes.apps.getLogs);
    router.get ('/api/v1/apps/:id/exec',      routes.developer.enabled, appsScope, routes.user.requireAdmin, routes.apps.exec);

    // subdomain routes
    router.get ('/api/v1/subdomains/:subdomain', routes.apps.getAppBySubdomain);

    // settings routes
    router.get ('/api/v1/settings/autoupdate_pattern', settingsScope, routes.settings.getAutoupdatePattern);
    router.post('/api/v1/settings/autoupdate_pattern', settingsScope, routes.settings.setAutoupdatePattern);
    router.get ('/api/v1/settings/cloudron_name', settingsScope, routes.settings.getCloudronName);
    router.post('/api/v1/settings/cloudron_name', settingsScope, routes.settings.setCloudronName);

    // backup routes
    router.get ('/api/v1/backups', settingsScope, routes.backups.get);
    router.post('/api/v1/backups', settingsScope, routes.backups.create);

    // upgrade handler
    httpServer.on('upgrade', function (req, socket, head) {
        if (req.headers['upgrade'] !== 'tcp') return req.end('Only TCP upgrades are possible');

        // create a node response object for express
        var res = new http.ServerResponse({});
        res.assignSocket(socket);
        res.sendUpgradeHandshake = function () { // could extend express.response as well
            socket.write('HTTP/1.1 101 TCP Handshake\r\n' +
                         'Upgrade: tcp\r\n' +
                         'Connection: Upgrade\r\n' +
                         '\r\n');
        };

        // route through express middleware
        app(req, res, function (error) {
            if (error) {
                console.error(error);
                socket.destroy();
            }
        });
    });

    return httpServer;
}

function initializeInternalExpressSync() {
    var app = express();
    var httpServer = http.createServer(app);

    var QUERY_LIMIT = '10mb'; // max size for json and urlencoded queries
    var REQUEST_TIMEOUT = 10000; // timeout for all requests

    var json = middleware.json({ strict: true, limit: QUERY_LIMIT }), // application/json
        urlencoded = middleware.urlencoded({ extended: false, limit: QUERY_LIMIT }); // application/x-www-form-urlencoded

    app.use(middleware.morgan('dev', { immediate: false }));

    var router = new express.Router();
    router.del = router.delete; // amend router.del for readability further on

    app
       .use(middleware.timeout(REQUEST_TIMEOUT))
       .use(json)
       .use(urlencoded)
       .use(router)
       .use(middleware.lastMile());

    // internal routes
    router.post('/api/v1/backup', routes.internal.backup);

    return httpServer;
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');
    assert.strictEqual(gHttpServer, null, 'Server is already up and running.');

    gHttpServer = initializeExpressSync();
    gInternalHttpServer = initializeInternalExpressSync();

    async.series([
        auth.initialize,
        database.initialize,
        taskmanager.initialize,
        cloudron.initialize,
        updater.initialize,
        mailer.initialize,
        cron.initialize,
        gHttpServer.listen.bind(gHttpServer, config.get('port'), '127.0.0.1'),
        gInternalHttpServer.listen.bind(gInternalHttpServer, config.get('internalPort'), '127.0.0.1')
    ], callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (!gHttpServer) return callback(null);

    async.series([
        auth.uninitialize,
        cloudron.uninitialize,
        updater.uninitialize,
        taskmanager.uninitialize,
        cron.uninitialize,
        mailer.uninitialize,
        database.uninitialize,
        gHttpServer.close.bind(gHttpServer),
        gInternalHttpServer.close.bind(gInternalHttpServer)
    ], function (error) {
        if (error) console.error(error);

        gHttpServer = null;
        gInternalHttpServer = null;

        callback(null);
    });
}
