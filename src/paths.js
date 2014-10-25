/* jslint node:true */

'use strict';

var config = require('../config.js'),
    path = require('path');

exports = module.exports = {
    NGINX_CONFIG_DIR: path.join(config.baseDir, 'configs/nginx'),
    NGINX_APPCONFIG_DIR: path.join(config.baseDir, 'configs/nginx/applications'),
    NGINX_CERT_DIR: path.join(config.baseDir, 'configs/nginx/cert'),

    HARAKA_CONFIG_DIR: path.join(config.baseDir, 'configs/haraka'),

    COLLECTD_APPCONFIG_DIR: path.join(config.baseDir, 'configs/collectd/collectd.conf.d'),

    DATA_DIR: path.join(config.baseDir, 'data'),
    APPDATA_DIR: path.join(config.baseDir, 'data/appdata'),
    DATABASE_FILENAME: path.join(config.baseDir, 'data/cloudron.sqlite'),

    APPICONS_DIR: path.join(config.baseDir, 'data/appicons'),

    VOLUMES_DATA_DIR: path.join(config.baseDir, 'volumes/data'),
    VOLUMES_MOUNT_DIR: path.join(config.baseDir, 'volumes/mount')
};

