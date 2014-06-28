#!/bin/bash

echo
echo "Starting YellowTent server at port 443..."
echo

BASEDIR=$(dirname $0)

# Fix the hostname for the admin application
sed -e "s/##ADMIN_HOSTNAME##/admin.$HOSTNAME/" nginx/admin.conf_template > nginx/applications/admin.conf

sudo mkdir -p /var/log/supervisord
sudo NGINX_ROOT=$BASEDIR supervisord -n -c supervisor/supervisord.conf

