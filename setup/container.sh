#!/bin/bash

set -eu -o pipefail

# This file can be used in Dockerfile

readonly container_files="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/container"

readonly CONFIG_DIR="/home/yellowtent/configs"
readonly DATA_DIR="/home/yellowtent/data"

########## create config directory
rm -rf "${CONFIG_DIR}" && mkdir "${CONFIG_DIR}"

########## logrotate (default ubuntu runs this daily)
rm -rf /etc/logrotate.d/*
cp -r "${container_files}/logrotate/." /etc/logrotate.d/

########## supervisor
rm -rf /etc/supervisor/*
cp -r "${container_files}/supervisor/." /etc/supervisor/

########## sudoers
rm /etc/sudoers.d/*
cp "${container_files}/sudoers" /etc/sudoers.d/yellowtent

########## collectd
rm -rf /etc/collectd
ln -sfF "${DATA_DIR}/collectd" /etc/collectd

########## nginx
# link nginx config to system config
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${DATA_DIR}/nginx" /etc/nginx

########## Restart services (this is only needed since we are not a real container)
update-rc.d -f collectd defaults
/etc/init.d/collectd restart

