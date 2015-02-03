#!/bin/bash

echo
echo "Starting Cloudron at port 443"
echo

readonly BOX_SRC_DIR="$(cd $(dirname "$0"); pwd)"
readonly PROVISION_VERSION=0.1
readonly PROVISION_BOX_VERSIONS_URL=0.1
readonly DATA_DIR=~/.yellowtent/data
readonly CONFIG_DIR=~/.yellowtent/configs
readonly NGINX_ROOT=~/.yellowtent/configs/nginx
readonly FQDN=admin-localhost

mkdir -p "${NGINX_ROOT}/applications"
mkdir -p "${NGINX_ROOT}/cert"
mkdir -p "${DATA_DIR}/appicons"
mkdir -p "${DATA_DIR}/appdata"
mkdir -p "${DATA_DIR}/mail"
mkdir -p "${CONFIG_DIR}/collectd/collectd.conf.d"

# get the database current
npm run-script migrate

cp setup/start/nginx/nginx.conf "${NGINX_ROOT}/nginx.conf"
cp setup/start/nginx/mime.types "${NGINX_ROOT}/mime.types"
cp setup/start/nginx/cert/* "${NGINX_ROOT}/cert/"

# adjust the generated nginx config for local use
touch "${NGINX_ROOT}/naked_domain.conf"
sed -e "s/##ADMIN_FQDN##/${FQDN}/" -e "s|##BOX_SRC_DIR##|${BOX_SRC_DIR}|" setup/start/nginx/admin.conf_template > "${NGINX_ROOT}/applications/admin.conf"
sed -e "s/user www-data/user ${USER}/" -i "${NGINX_ROOT}/nginx.conf"

# add webadmin oauth client
readonly WEBADMIN_ID=abcdefg
readonly WEBADMIN_SCOPES="root,profile,users,apps,settings,roleAdmin"
sqlite3 "${DATA_DIR}/cloudron.sqlite" "INSERT OR REPLACE INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) VALUES (\"${WEBADMIN_ID}\", \"webadmin\", \"cid-webadmin\", \"secret-webadmin\", \"WebAdmin\", \"https://${FQDN}\", \"${WEBADMIN_SCOPES}\")"

# start nginx
sudo nginx -c nginx.conf -p "${NGINX_ROOT}"

