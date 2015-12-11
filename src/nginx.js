/* jslint node:true */

'use strict';

var config = require('./config.js'),
    ejs = require('ejs'),
    fs = require('fs'),
    path = require('path'),
    paths = require('./paths.js'),
    safe = require('safetydance'),
    shell = require('./shell.js');

exports = module.exports = {
    configureAdmin: configureAdmin,
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

function reload(callback) {
    shell.sudo('reload', [ RELOAD_NGINX_CMD ], callback);
}
