#!/bin/bash

set -eu -o pipefail

# Only GNU sed supports inline replace. brew install gnu-sed to get the GNU sed on OS X
[[ $(uname -s) == "Darwin" ]] && GNU_SED="/usr/local/bin/gsed" || GNU_SED="sed"
readonly GNU_SED

echo
echo "Starting Cloudron at port 443"
echo

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BOX_SRC_DIR="$(cd $(dirname "$0"); pwd)"
readonly PROVISION_VERSION=0.1
readonly PROVISION_BOX_VERSIONS_URL=0.1
readonly DATA_DIR=~/.cloudron/data
readonly CONFIG_DIR=~/.cloudron/configs
readonly NGINX_ROOT=~/.cloudron/configs/nginx
readonly ADMIN_LOCATION=my
readonly FQDN="${ADMIN_LOCATION}-localhost"

admin_origin="https://${FQDN}"

if [[ ! -f "${SCRIPT_DIR}/../appstore/src/scripts/generate_certificate.sh" ]]; then
    echo "Could not locate generate_certificate.sh"
    exit 1
fi

mkdir -p "${NGINX_ROOT}/applications"
mkdir -p "${NGINX_ROOT}/cert"
mkdir -p "${DATA_DIR}/box/appicons"
mkdir -p "${DATA_DIR}/mail"
mkdir -p "${CONFIG_DIR}/addons"
mkdir -p "${CONFIG_DIR}/collectd/collectd.conf.d"

# get the database current
npm run-script migrate_local

cp setup/start/nginx/nginx.conf "${NGINX_ROOT}/nginx.conf"
cp setup/start/nginx/mime.types "${NGINX_ROOT}/mime.types"

${SCRIPT_DIR}/../appstore/src/scripts/generate_certificate.sh "US" "California" "San Francisco" "Cloudron Company" "Cloudron" "my-localhost" "cert@cloudron.io" "${NGINX_ROOT}/cert"

# adjust the generated nginx config for local use
${SCRIPT_DIR}/node_modules/.bin/ejs-cli -f "${SCRIPT_DIR}/setup/start/nginx/appconfig.ejs" \
    -O "{ \"endpoint\": \"admin\", \"vhost\": \"${FQDN}\", \"sourceDir\": \"${BOX_SRC_DIR}\", \"adminOrigin\": \"${admin_origin}\" }" > "${NGINX_ROOT}/applications/admin.conf"

$GNU_SED -e "s/user www-data/user ${USER}/" -i "${NGINX_ROOT}/nginx.conf"
$GNU_SED -e "s/^pid .*/pid \/tmp\/nginx.pid;/" -i "${NGINX_ROOT}/nginx.conf"

# add webadmin oauth client
readonly WEBADMIN_ID=abcdefg
readonly WEBADMIN_SCOPES="root,developer,profile,users,apps,settings,roleUser"
mysql --user=root --password="" -e "REPLACE INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (\"cid-webadmin\", \"webadmin\", \"secret-webadmin\", \"https://${FQDN}\", \"${WEBADMIN_SCOPES}\")" box

# start nginx
echo "Restarting nginx..."

if [[ `ps -A | grep nginx` ]]; then
	sudo killall nginx
	sleep 1
fi

sudo nginx -c nginx.conf -p "${NGINX_ROOT}"

