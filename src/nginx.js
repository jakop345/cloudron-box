/* jslint node:true */

'use strict';

var assert = require('assert'),
    config = require('./config.js'),
    debug = require('debug')('box:src/nginx'),
    ejs = require('ejs'),
    fs = require('fs'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js');

exports = module.exports = {
    requiresOAuthProxy: requiresOAuthProxy,
    configureAdmin: configureAdmin,
    configureApp: configureApp,
    unconfigureApp: unconfigureApp,
    reload: reload
};

var NGINX_APPCONFIG_EJS = fs.readFileSync(__dirname + '/../setup/start/nginx/appconfig.ejs', { encoding: 'utf8' }),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh');

function requiresOAuthProxy(app) {
    assert.strictEqual(typeof app, 'object');

    var tmp = app.accessRestriction;

    // if no accessRestriction set, or the app uses one of the auth modules, we do not need the oauth proxy
    if (tmp === null) return false;
    if (app.manifest.addons['ldap'] || app.manifest.addons['oauth'] || app.manifest.addons['simpleauth']) return false;

    // check if any restrictions are set
    return !!((tmp.users && tmp.users.length) || (tmp.groups && tmp.groups.length));
}

function configureAdmin(certFilePath, keyFilePath, callback) {
    assert.strictEqual(typeof certFilePath, 'string');
    assert.strictEqual(typeof keyFilePath, 'string');
    assert.strictEqual(typeof callback, 'function');

    var data = {
        sourceDir: path.resolve(__dirname, '..'),
        adminOrigin: config.adminOrigin(),
        vhost: config.adminFqdn(),
        endpoint: 'admin',
        certFilePath: certFilePath,
        keyFilePath: keyFilePath
    };
    var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, data);
    var nginxConfigFilename = path.join(paths.NGINX_APPCONFIG_DIR, 'admin.conf');

    if (!safe.fs.writeFileSync(nginxConfigFilename, nginxConf)) return callback(safe.error);

    reload(callback);
}

function configureApp(app, certFilePath, keyFilePath, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof certFilePath, 'string');
    assert.strictEqual(typeof keyFilePath, 'string');
    assert.strictEqual(typeof callback, 'function');

    var sourceDir = path.resolve(__dirname, '..');
    var oauthProxy = requiresOAuthProxy(app);
    var endpoint = oauthProxy ? 'oauthproxy' : 'app';
    var vhost = config.appFqdn(app.location);

    var data = {
        sourceDir: sourceDir,
        adminOrigin: config.adminOrigin(),
        vhost: vhost,
        port: app.httpPort,
        endpoint: endpoint,
        certFilePath: certFilePath,
        keyFilePath: keyFilePath
    };
    var nginxConf = ejs.render(NGINX_APPCONFIG_EJS, data);

    var nginxConfigFilename = path.join(paths.NGINX_APPCONFIG_DIR, app.id + '.conf');
    debug('writing config for "%s" to %s', app.location, nginxConfigFilename);

    if (!safe.fs.writeFileSync(nginxConfigFilename, nginxConf)) {
        debug('Error creating nginx config for "%s" : %s', app.location, safe.error.message);
        return callback(safe.error);
    }

    reload(callback);
}

function unconfigureApp(app, callback) {
    assert.strictEqual(typeof app, 'object');
    assert.strictEqual(typeof callback, 'function');

    var nginxConfigFilename = path.join(paths.NGINX_APPCONFIG_DIR, app.id + '.conf');
    if (!safe.fs.unlinkSync(nginxConfigFilename)) {
        debug('Error removing nginx configuration of "%s": %s', app.location, safe.error.message);
        return callback(null);
    }

    reload(callback);
}

function reload(callback) {
    shell.sudo('reload', [ RELOAD_NGINX_CMD ], callback);
}
