#!/bin/bash

echo
echo "Starting Cloudron at port 443"
echo

SRCDIR="$(cd $(dirname "$0"); pwd)"
NGINX_ROOT=~/.yellowtent/nginx
PROVISION_VERSION=0.1
PROVISION_BOX_VERSIONS_URL=0.1
DATA_DIR=~/.yellowtent/data

mkdir -p $NGINX_ROOT/applications
mkdir -p $NGINX_ROOT/cert
mkdir -p $DATA_DIR

cp postinstall/nginx/nginx.conf $NGINX_ROOT/nginx.conf
cp postinstall/nginx/mime.types $NGINX_ROOT/mime.types
cp postinstall/nginx/cert/* $NGINX_ROOT/cert/

touch $NGINX_ROOT/naked_domain.conf
sed -e "s/##ADMIN_FQDN##/admin-localhost/" -e "s|##SRCDIR##|$SRCDIR|" postinstall/nginx/admin.conf_template > $NGINX_ROOT/applications/admin.conf

echo "{ \"version\": \"$PROVISION_VERSION\", \"boxVersionsUrl\": \"$PROVISION_BOX_VERSIONS_URL\" }" > "$DATA_DIR/version.json"

sudo nginx -c nginx.conf -p $NGINX_ROOT

