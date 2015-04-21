#!/bin/bash

set -eu -o pipefail

# This file can be used in Dockerfile

readonly container_files="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/container"

readonly CONFIG_DIR="/home/yellowtent/configs"

########## create config directory
mkdir -p "${CONFIG_DIR}/addons"
mkdir -p "${CONFIG_DIR}/nginx/applications"
mkdir -p "${CONFIG_DIR}/nginx/cert"
mkdir -p "${CONFIG_DIR}/collectd/collectd.conf.d"
mkdir -p "${CONFIG_DIR}/nginx/applications"
mkdir -p "${CONFIG_DIR}/nginx/cert"

########## logrotate (default ubuntu runs this daily)
rm -rf /etc/logrotate.d/*
cp -r "${container_files}/logrotate/" /etc/logrotate.d/

########## supervisor
rm -rf /etc/supervisor/*
cp -r "${container_files}/supervisor/" /etc/supervisor/

########## sudoers
rm /etc/sudoers.d/*
cp -r "${container_files}/sudoers" /etc/sudoers.d/yellowtent

########## collectd
rm -rf /etc/collectd
ln -sfF "${CONFIG_DIR}/collectd" /etc/collectd
cp -r "${container_files}/collectd.conf" "${CONFIG_DIR}/collectd/collectd.conf"

########## nginx
cp "${container_files}/nginx/nginx.conf" "${CONFIG_DIR}/nginx/nginx.conf"
cp "${container_files}/nginx/mime.types" "${CONFIG_DIR}/nginx/mime.types"

# link nginx config to system config
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${CONFIG_DIR}/nginx" /etc/nginx

########## Restart services (this is only needed since we are not a real container)
update-rc.d -f collectd defaults
/etc/init.d/collectd restart

