/* jslint node:true */

'use strict';

var config = require('../config.js'),
    path = require('path');

exports = module.exports = {
    NGINX_CONFIG_DIR: path.join(config.baseDir, 'nginx'),
    NGINX_APPCONFIG_DIR: path.join(config.baseDir, 'nginx/applications'),
    NGINX_CERT_DIR: path.join(config.baseDir, 'nginx/cert'),

    HARAKA_CONFIG_DIR: path.join(config.baseDir, 'haraka'),

    COLLECTD_APPCONFIG_DIR: path.join(config.baseDir, 'collectd/collectd.conf.d'),

    DATA_DIR: path.join(config.baseDir, 'data'),
    APPDATA_DIR: path.join(config.baseDir, 'data/appdata'),
    DATABASE_FILENAME: path.join(config.baseDir, 'data/cloudron.sqlite'),

    APPICONS_DIR: path.join(config.baseDir, 'appicons'),

    VOLUMES_DATA_DIR: path.join(config.baseDir, 'volumes/data'),
    VOLUMES_MOUNT_DIR: path.join(config.baseDir, 'volumes/mount')
};

