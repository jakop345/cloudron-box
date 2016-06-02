'use strict';

exports = module.exports = {
    start: start,
    stop: stop
};

var assert = require('assert'),
    async = require('async'),
    auth = require('./auth.js'),
    certificates = require('./certificates.js'),
    clients = require('./clients.js'),
    cloudron = require('./cloudron.js'),
    cron = require('./cron.js'),
    config = require('./config.js'),
    database = require('./database.js'),
    eventlog = require('./eventlog.js'),
    express = require('express'),
    http = require('http'),
    mailer = require('./mailer.js'),
    middleware = require('./middleware'),
    passport = require('passport'),
    path = require('path'),
    platform = require('./platform.js'),
    routes = require('./routes/index.js'),
    taskmanager = require('./taskmanager.js');

var gHttpServer = null;
var gSysadminHttpServer = null;

function initializeExpressSync() {
    var app = express();
    var httpServer = http.createServer(app);

    var QUERY_LIMIT = '1mb', // max size for json and urlencoded queries (see also client_max_body_size in nginx)
        FIELD_LIMIT = 2 * 1024 * 1024; // max fields that can appear in multipart

    var REQUEST_TIMEOUT = 10000; // timeout for all requests (see also setTimeout on the httpServer)

    var json = middleware.json({ strict: true, limit: QUERY_LIMIT }), // application/json
        urlencoded = middleware.urlencoded({ extended: false, limit: QUERY_LIMIT }); // application/x-www-form-urlencoded

    app.set('views', path.join(__dirname, 'oauth2views'));
    app.set('view options', { layout: true, debug: false });
    app.set('view engine', 'ejs');
    app.set('json spaces', 2); // pretty json

    if (process.env.BOX_ENV !== 'test') app.use(middleware.morgan('Box :method :url :status :response-time ms - :res[content-length]', { immediate: false }));

    var router = new express.Router();
    router.del = router.delete; // amend router.del for readability further on

    app
       .use(middleware.timeout(REQUEST_TIMEOUT))
       .use(json)
       .use(urlencoded)
       .use(middleware.cookieParser())
       .use(middleware.cors({ origins: [ '*' ], allowCredentials: true }))
       .use(middleware.session({ secret: 'yellow is blue', resave: true, saveUninitialized: true, cookie: { path: '/', httpOnly: true, secure: false, maxAge: 600000 } }))
       .use(passport.initialize())
       .use(passport.session())
       .use(router)
       .use(middleware.lastMile());

    // NOTE: these limits have to be in sync with nginx limits
    var FILE_SIZE_LIMIT = '1mb', // max file size that can be uploaded (see also client_max_body_size in nginx)
        FILE_TIMEOUT = 60 * 1000; // increased timeout for file uploads (1 min)

    var multipart = middleware.multipart({ maxFieldsSize: FIELD_LIMIT, limit: FILE_SIZE_LIMIT, timeout: FILE_TIMEOUT });

    // scope middleware implicitly also adds bearer token verification
    var rootScope = routes.oauth2.scope(clients.SCOPE_ROOT);
    var profileScope = routes.oauth2.scope(clients.SCOPE_PROFILE);
    var usersScope = routes.oauth2.scope(clients.SCOPE_USERS);
    var appsScope = routes.oauth2.scope(clients.SCOPE_APPS);
    var developerScope = routes.oauth2.scope(clients.SCOPE_DEVELOPER);
    var settingsScope = routes.oauth2.scope(clients.SCOPE_SETTINGS);

    // csrf protection
    var csrf = routes.oauth2.csrf;

    // public routes
    router.post('/api/v1/cloudron/activate', routes.cloudron.setupTokenAuth, routes.cloudron.activate);
    router.get ('/api/v1/cloudron/progress', routes.cloudron.getProgress);
    router.get ('/api/v1/cloudron/status', routes.cloudron.getStatus);
    router.get ('/api/v1/cloudron/avatar', routes.settings.getCloudronAvatar); // this is a public alias for /api/v1/settings/cloudron_avatar

    // developer routes
    router.post('/api/v1/developer', developerScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.developer.setEnabled);
    router.get ('/api/v1/developer', developerScope, routes.developer.enabled, routes.developer.status);
    router.post('/api/v1/developer/login', routes.developer.enabled, routes.developer.login);
    router.get ('/api/v1/developer/apps', developerScope, routes.developer.enabled, routes.developer.apps);

    // private routes
    router.get ('/api/v1/cloudron/config', rootScope, routes.cloudron.getConfig);
    router.post('/api/v1/cloudron/update', rootScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.cloudron.update);
    router.post('/api/v1/cloudron/reboot', rootScope, routes.cloudron.reboot);
    router.get ('/api/v1/cloudron/graphs', rootScope, routes.graphs.getGraphs);

    // feedback
    router.post('/api/v1/cloudron/feedback', usersScope, routes.cloudron.feedback);

    // profile api, working off the user behind the provided token
    router.get ('/api/v1/profile', profileScope, routes.profile.get);
    router.post('/api/v1/profile', profileScope, routes.profile.update);
    router.post('/api/v1/profile/password', profileScope, routes.user.verifyPassword, routes.profile.changePassword);
    router.post('/api/v1/profile/tutorial', profileScope, routes.profile.setShowTutorial);

    // user routes
    router.get ('/api/v1/users', usersScope, routes.user.requireAdmin, routes.user.list);
    router.post('/api/v1/users', usersScope, routes.user.requireAdmin, routes.user.create);
    router.get ('/api/v1/users/:userId', usersScope, routes.user.requireAdmin, routes.user.get);
    router.del ('/api/v1/users/:userId', usersScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.user.remove);
    router.post('/api/v1/users/:userId', usersScope, routes.user.requireAdmin, routes.user.update);
    router.put ('/api/v1/users/:userId/groups', usersScope, routes.user.requireAdmin, routes.user.setGroups);
    router.post('/api/v1/users/:userId/invite', usersScope, routes.user.requireAdmin, routes.user.sendInvite);

    // Group management
    router.get ('/api/v1/groups', usersScope, routes.user.requireAdmin, routes.groups.list);
    router.post('/api/v1/groups', usersScope, routes.user.requireAdmin, routes.groups.create);
    router.get ('/api/v1/groups/:groupId', usersScope, routes.user.requireAdmin, routes.groups.get);
    router.del ('/api/v1/groups/:groupId', usersScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.groups.remove);

    // Mailbox management
    router.get ('/api/v1/mailboxes', usersScope, routes.user.requireAdmin, routes.mailboxes.list);
    router.post('/api/v1/mailboxes', usersScope, routes.user.requireAdmin, routes.mailboxes.create);
    router.get ('/api/v1/mailboxes/:mailboxId', usersScope, routes.user.requireAdmin, routes.mailboxes.get);
    router.del ('/api/v1/mailboxes/:mailboxId', usersScope, routes.user.requireAdmin, routes.mailboxes.remove);
    router.put ('/api/v1/mailboxes/:mailboxId/aliases', usersScope, routes.user.requireAdmin, routes.mailboxes.setAliases);
    router.get ('/api/v1/mailboxes/:mailboxId/aliases', usersScope, routes.user.requireAdmin, routes.mailboxes.getAliases);

    // form based login routes used by oauth2 frame
    router.get ('/api/v1/session/login', csrf, routes.oauth2.loginForm);
    router.post('/api/v1/session/login', csrf, routes.oauth2.login);
    router.get ('/api/v1/session/logout', routes.oauth2.logout);
    router.get ('/api/v1/session/callback', routes.oauth2.callback);
    router.get ('/api/v1/session/password/resetRequest.html', csrf, routes.oauth2.passwordResetRequestSite);
    router.post('/api/v1/session/password/resetRequest', csrf, routes.oauth2.passwordResetRequest);
    router.get ('/api/v1/session/password/sent.html', routes.oauth2.passwordSentSite);
    router.get ('/api/v1/session/password/reset.html', csrf, routes.oauth2.passwordResetSite);
    router.post('/api/v1/session/password/reset', csrf, routes.oauth2.passwordReset);
    router.get ('/api/v1/session/account/setup.html', csrf, routes.oauth2.accountSetupSite);
    router.post('/api/v1/session/account/setup', csrf, routes.oauth2.accountSetup);

    // oauth2 routes
    router.get ('/api/v1/oauth/dialog/authorize', routes.oauth2.authorization);
    router.post('/api/v1/oauth/token', routes.oauth2.token);
    router.get ('/api/v1/oauth/clients', settingsScope, routes.clients.getAllByUserId);
    router.post('/api/v1/oauth/clients', routes.developer.enabled, settingsScope, routes.clients.add);
    router.get ('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.get);
    router.post('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.add);
    router.del ('/api/v1/oauth/clients/:clientId', routes.developer.enabled, settingsScope, routes.clients.del);
    router.get ('/api/v1/oauth/clients/:clientId/tokens', settingsScope, routes.clients.getClientTokens);
    router.del ('/api/v1/oauth/clients/:clientId/tokens', settingsScope, routes.clients.delClientTokens);

    // app routes
    router.get ('/api/v1/apps',          appsScope, routes.apps.getApps);
    router.get ('/api/v1/apps/:id',      appsScope, routes.apps.getApp);
    router.get ('/api/v1/apps/:id/icon', routes.apps.getAppIcon);

    router.post('/api/v1/apps/install',       appsScope, routes.user.requireAdmin, routes.apps.installApp);
    router.post('/api/v1/apps/:id/uninstall', appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.uninstallApp);
    router.post('/api/v1/apps/:id/configure', appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.configureApp);
    router.post('/api/v1/apps/:id/update',    appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.updateApp);
    router.post('/api/v1/apps/:id/restore',   appsScope, routes.user.requireAdmin, routes.user.verifyPassword, routes.apps.restoreApp);
    router.post('/api/v1/apps/:id/backup',    appsScope, routes.user.requireAdmin, routes.apps.backupApp);
    router.get ('/api/v1/apps/:id/backups',   appsScope, routes.user.requireAdmin, routes.apps.listBackups);
    router.post('/api/v1/apps/:id/stop',      appsScope, routes.user.requireAdmin, routes.apps.stopApp);
    router.post('/api/v1/apps/:id/start',     appsScope, routes.user.requireAdmin, routes.apps.startApp);
    router.get ('/api/v1/apps/:id/logstream', appsScope, routes.user.requireAdmin, routes.apps.getLogStream);
    router.get ('/api/v1/apps/:id/logs',      appsScope, routes.user.requireAdmin, routes.apps.getLogs);
    router.get ('/api/v1/apps/:id/exec',      routes.developer.enabled, appsScope, routes.user.requireAdmin, routes.apps.exec);

    // settings routes (these are for the settings tab - avatar & name have public routes for normal users. see above)
    router.get ('/api/v1/settings/autoupdate_pattern', settingsScope, routes.user.requireAdmin, routes.settings.getAutoupdatePattern);
    router.post('/api/v1/settings/autoupdate_pattern', settingsScope, routes.user.requireAdmin, routes.settings.setAutoupdatePattern);
    router.get ('/api/v1/settings/cloudron_name',      settingsScope, routes.user.requireAdmin, routes.settings.getCloudronName);
    router.post('/api/v1/settings/cloudron_name',      settingsScope, routes.user.requireAdmin, routes.settings.setCloudronName);
    router.get ('/api/v1/settings/cloudron_avatar',    settingsScope, routes.user.requireAdmin, routes.settings.getCloudronAvatar);
    router.post('/api/v1/settings/cloudron_avatar',    settingsScope, routes.user.requireAdmin, multipart, routes.settings.setCloudronAvatar);
    router.get ('/api/v1/settings/dns_config',         settingsScope, routes.user.requireAdmin, routes.settings.getDnsConfig);
    router.post('/api/v1/settings/dns_config',         settingsScope, routes.user.requireAdmin, routes.settings.setDnsConfig);
    router.get ('/api/v1/settings/backup_config',      settingsScope, routes.user.requireAdmin, routes.settings.getBackupConfig);
    router.post('/api/v1/settings/backup_config',      settingsScope, routes.user.requireAdmin, routes.settings.setBackupConfig);
    router.post('/api/v1/settings/certificate',        settingsScope, routes.user.requireAdmin, routes.settings.setCertificate);
    router.post('/api/v1/settings/admin_certificate',  settingsScope, routes.user.requireAdmin, routes.settings.setAdminCertificate);
    router.get ('/api/v1/settings/time_zone',          settingsScope, routes.user.requireAdmin, routes.settings.getTimeZone);

    // eventlog route
    router.get('/api/v1/eventlog', settingsScope, routes.user.requireAdmin, routes.eventlog.get);

    // backup routes
    router.get ('/api/v1/backups', settingsScope, routes.user.requireAdmin, routes.backups.get);
    router.post('/api/v1/backups', settingsScope, routes.user.requireAdmin, routes.backups.create);
    router.get ('/api/v1/backups/:backupId', appsScope, routes.user.requireAdmin, routes.backups.download);

    // disable server socket "idle" timeout. we use the timeout middleware to handle timeouts on a route level
    // we rely on nginx for timeouts on the TCP level (see client_header_timeout)
    httpServer.setTimeout(0);

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

// provides hooks for the 'installer'
function initializeSysadminExpressSync() {
    var app = express();
    var httpServer = http.createServer(app);

    var QUERY_LIMIT = '1mb'; // max size for json and urlencoded queries
    var REQUEST_TIMEOUT = 10000; // timeout for all requests

    var json = middleware.json({ strict: true, limit: QUERY_LIMIT }), // application/json
        urlencoded = middleware.urlencoded({ extended: false, limit: QUERY_LIMIT }); // application/x-www-form-urlencoded

    if (process.env.BOX_ENV !== 'test') app.use(middleware.morgan('Box Sysadmin :method :url :status :response-time ms - :res[content-length]', { immediate: false }));

    var router = new express.Router();
    router.del = router.delete; // amend router.del for readability further on

    app
       .use(middleware.timeout(REQUEST_TIMEOUT))
       .use(json)
       .use(urlencoded)
       .use(router)
       .use(middleware.lastMile());

    // Sysadmin routes
    router.post('/api/v1/backup', routes.sysadmin.backup);
    router.post('/api/v1/update', routes.sysadmin.update);
    router.post('/api/v1/retire', routes.sysadmin.retire);

    return httpServer;
}

function start(callback) {
    assert.strictEqual(typeof callback, 'function');
    assert.strictEqual(gHttpServer, null, 'Server is already up and running.');

    gHttpServer = initializeExpressSync();
    gSysadminHttpServer = initializeSysadminExpressSync();

    async.series([
        auth.initialize,
        database.initialize,
        cloudron.initialize, // keep this here because it reads activation state that others depend on
        certificates.installAdminCertificate, // keep this before cron to block heartbeats until cert is ready
        platform.initialize,
        taskmanager.initialize,
        mailer.initialize,
        cron.initialize,
        gHttpServer.listen.bind(gHttpServer, config.get('port'), '127.0.0.1'),
        gSysadminHttpServer.listen.bind(gSysadminHttpServer, config.get('sysadminPort'), '127.0.0.1'),
        eventlog.add.bind(null, eventlog.ACTION_START, { userId: null, username: 'boot' }, { version: config.version() })
    ], callback);
}

function stop(callback) {
    assert.strictEqual(typeof callback, 'function');

    if (!gHttpServer) return callback(null);

    async.series([
        auth.uninitialize,
        cloudron.uninitialize,
        taskmanager.uninitialize,
        cron.uninitialize,
        mailer.uninitialize,
        database.uninitialize,
        gHttpServer.close.bind(gHttpServer),
        gSysadminHttpServer.close.bind(gSysadminHttpServer)
    ], function (error) {
        if (error) console.error(error);

        gHttpServer = null;
        gSysadminHttpServer = null;

        callback(null);
    });
}
