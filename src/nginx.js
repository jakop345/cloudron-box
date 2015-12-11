/* jslint node:true */

'use strict';

var config = require('./config.js'),
    debug = require('debug')('src/nginx.js'),
    ejs = require('ejs'),
    fs = require('fs'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js');

exports = module.exports = {
    configureAdmin: configureAdmin,
    configureApp: configureApp,
    unconfigureApp: unconfigureApp,
    reload: reload
};

var NGINX_APPCONFIG_EJS = fs.readFileSync(__dirname + '/../setup/start/nginx/appconfig.ejs', { encoding: 'utf8' }),
    RELOAD_NGINX_CMD = path.join(__dirname, 'scripts/reloadnginx.sh');

function configureAdmin(certFilePath, keyFilePath, callback) {
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
    var sourceDir = path.resolve(__dirname, '..');
    var endpoint = app.oauthProxy ? 'oauthproxy' : 'app';
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