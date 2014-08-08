#!/bin/bash

echo
echo "Starting YellowTent server at port 443..."
echo

SRCDIR="$(cd $(dirname "$0"); pwd)"

# Fix the hostname for the admin application
FQDN=`hostname -f`
sed -e "s/##ADMIN_FQDN##/admin-$FQDN/" -e "s|##SRCDIR##|$SRCDIR|" nginx/admin.conf_template > nginx/applications/admin.conf
touch nginx/naked_domain.conf

sudo mkdir -p /var/log/supervisor
sudo NGINX_ROOT=$SRCDIR supervisord -n -c supervisor/supervisord.conf

