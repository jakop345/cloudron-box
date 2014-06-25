#!/bin/sh

echo
echo "Starting YellowTent server at port 443..."
echo

BASEDIR=$(dirname $0)

sudo mkdir -p /var/log/supervisord
sudo NGINX_ROOT=$BASEDIR supervisord -n -c supervisor/supervisord.conf

