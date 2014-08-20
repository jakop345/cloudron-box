#!/bin/bash

echo
echo "Starting YellowTent server at port 443..."
echo

SRCDIR="$(cd $(dirname "$0"); pwd)"
NGINX_ROOT=~/.yellowtent/nginx

mkdir -p $NGINX_ROOT

touch nginx/naked_domain.conf

cp -rf $SRCDIR/nginx/* $NGINX_ROOT/
sed -e "s/##ADMIN_FQDN##/admin-localhost/" -e "s|##SRCDIR##|$SRCDIR|" nginx/admin.conf_template > $NGINX_ROOT/applications/admin.conf

sudo mkdir -p /var/log/supervisor
sudo NGINX_ROOT=$NGINX_ROOT supervisord -n -c supervisor/supervisord.conf

