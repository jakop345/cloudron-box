/* jslint node:true */

'use strict';

var config = require('../config.js'),
    path = require('path');

// keep these values in sync with start.sh
exports = module.exports = {
    NGINX_CONFIG_DIR: path.join(config.baseDir(), 'configs/nginx'),
    NGINX_APPCONFIG_DIR: path.join(config.baseDir(), 'configs/nginx/applications'),
    NGINX_CERT_DIR: path.join(config.baseDir(), 'configs/nginx/cert'),

    ADDON_CONFIG_DIR: path.join(config.baseDir(), 'configs/addons'),

    COLLECTD_APPCONFIG_DIR: path.join(config.baseDir(), 'configs/collectd/collectd.conf.d'),

    APP_SOURCES_DIR: path.join(config.baseDir(), 'sources'),

    DATA_DIR: path.join(config.baseDir(), 'data'),
    BOX_DATA_DIR: path.join(config.baseDir(), 'data/box'),
    // this is not part of appdata because an icon may be set before install
    APPICONS_DIR: path.join(config.baseDir(), 'data/box/appicons'),
    MAIL_DATA_DIR: path.join(config.baseDir(), 'data/box/mail')
};

