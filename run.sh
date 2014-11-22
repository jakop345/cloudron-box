#!/bin/bash

echo
echo "Starting Cloudron at port 443"
echo

SRCDIR="$(cd $(dirname "$0"); pwd)"
NGINX_ROOT=~/.yellowtent/nginx

mkdir -p $NGINX_ROOT


# keep this in sync with scripts/bootstrap.sh
mkdir -p $NGINX_ROOT/applications
mkdir -p $NGINX_ROOT/cert

cp nginx/nginx.conf $NGINX_ROOT/nginx.conf
cp nginx/mime.types $NGINX_ROOT/mime.types
cp nginx/certificates.conf $NGINX_ROOT/certificates.conf
cp nginx/cert/* $NGINX_ROOT/cert/

touch $NGINX_ROOT/naked_domain.conf
sed -e "s/##ADMIN_FQDN##/admin-localhost/" -e "s|##SRCDIR##|$SRCDIR|" nginx/admin.conf_template > $NGINX_ROOT/applications/admin.conf

sudo nginx -c nginx.conf -p $NGINX_ROOT

