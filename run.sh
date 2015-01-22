#!/bin/bash

echo
echo "Starting Cloudron at port 443"
echo

readonly BOX_SRC_DIR="$(cd $(dirname "$0"); pwd)"
readonly NGINX_ROOT=~/.yellowtent/nginx
readonly PROVISION_VERSION=0.1
readonly PROVISION_BOX_VERSIONS_URL=0.1
readonly DATA_DIR=~/.yellowtent/data

mkdir -p "${NGINX_ROOT}/applications"
mkdir -p "${NGINX_ROOT}/cert"
mkdir -p "${DATA_DIR}"

# get the database current
npm run-script migrate

cp postinstall/nginx/nginx.conf "${NGINX_ROOT}/nginx.conf"
cp postinstall/nginx/mime.types "${NGINX_ROOT}/mime.types"
cp postinstall/nginx/cert/* "${NGINX_ROOT}/cert/"

# adjust the generated nginx config for local use
touch "${NGINX_ROOT}/naked_domain.conf"
sed -e "s/##ADMIN_FQDN##/admin-localhost/" -e "s|##BOX_SRC_DIR##|${BOX_SRC_DIR}|" postinstall/nginx/admin.conf_template > "${NGINX_ROOT}/applications/admin.conf"
sed -e "s/user www-data/user $USER/" -i $NGINX_ROOT/nginx.conf

# add webadmin oauth client
readonly WEBADMIN_ID=abcdefg
readonly WEBADMIN_ORIGIN=https://admin-localhost
readonly WEBADMIN_SCOPES="root,profile,users,apps,settings,roleAdmin"
sqlite3 "${DATA_DIR}/cloudron.sqlite" "INSERT OR REPLACE INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) VALUES (\"${WEBADMIN_ID}\", \"webadmin\", \"cid-webadmin\", \"secret-webadmin\", \"WebAdmin\", \"${WEBADMIN_ORIGIN}\", \"${WEBADMIN_SCOPES}\")"

# start nginx
sudo nginx -c nginx.conf -p "${NGINX_ROOT}"

