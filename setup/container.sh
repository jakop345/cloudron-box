#!/bin/bash

set -eu -o pipefail

# This file can be used in Dockerfile

readonly container_files="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/container"

readonly CONFIG_DIR="/home/yellowtent/configs"
readonly DATA_DIR="/home/yellowtent/data"

########## create config directory
rm -rf "${CONFIG_DIR}"
sudo -u yellowtent mkdir "${CONFIG_DIR}"

########## systemd
rm /etc/systemd/system/janitor.*
cp -r "${container_files}/systemd/." /etc/systemd/system/
systemctl daemon-reload
systemctl enable cloudron.target

########## sudoers
rm /etc/sudoers.d/*
cp "${container_files}/sudoers" /etc/sudoers.d/yellowtent

########## collectd
rm -rf /etc/collectd
ln -sfF "${DATA_DIR}/collectd" /etc/collectd

########## apparmor docker profile
cp "${container_files}/docker-cloudron-app.apparmor" /etc/apparmor.d/docker-cloudron-app
systemctl restart apparmor

########## docker janitor
cp "${container_files}/docker_janitor" /usr/sbin/docker_janitor

########## nginx
# link nginx config to system config
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${DATA_DIR}/nginx" /etc/nginx

########## mysql
cp "${container_files}/mysql.cnf" /etc/mysql/mysql.cnf

########## Enable services
update-rc.d -f collectd defaults

