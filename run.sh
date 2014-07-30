#!/bin/bash

echo
echo "Starting YellowTent server at port 443..."
echo

BASEDIR=$(dirname $0)

# Fix the hostname for the admin application
FQDN=`hostname -f`
sed -e "s/##ADMIN_FQDN##/admin-$FQDN/" nginx/admin.conf_template > nginx/applications/admin.conf
touch nginx/naked_domain.conf

sudo mkdir -p /var/log/supervisord
sudo NGINX_ROOT=$BASEDIR supervisord -n -c supervisor/supervisord.conf

