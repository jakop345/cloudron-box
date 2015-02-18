#!/bin/bash

set -eu

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
readonly FQDN=admin-localhost

if [[ ! -f "${SCRIPT_DIR}/../appstore/src/scripts/generate_certificate.sh" ]]; then
    echo "Could not locate generate_certificate.sh"
    exit 1
fi

mkdir -p "${NGINX_ROOT}/applications"
mkdir -p "${NGINX_ROOT}/cert"
mkdir -p "${DATA_DIR}/appicons"
mkdir -p "${DATA_DIR}/appdata"
mkdir -p "${DATA_DIR}/mail"
mkdir -p "${CONFIG_DIR}/addons"
mkdir -p "${CONFIG_DIR}/collectd/collectd.conf.d"

# get the database current
npm run-script migrate

cp setup/start/nginx/nginx.conf "${NGINX_ROOT}/nginx.conf"
cp setup/start/nginx/mime.types "${NGINX_ROOT}/mime.types"

${SCRIPT_DIR}/../appstore/src/scripts/generate_certificate.sh "US" "California" "San Francisco" "Cloudron Company" "Cloudron" "localhost" "cert@cloudron.io" "${NGINX_ROOT}/cert"

# adjust the generated nginx config for local use
${SCRIPT_DIR}/node_modules/.bin/ejs-cli -f "${SCRIPT_DIR}/setup/start/nginx/appconfig.ejs" \
    -O "{ \"vhost\": \"${FQDN}\", \"appId\": \"admin\", \"sourceDir\": \"${BOX_SRC_DIR}\" }" > "${NGINX_ROOT}/naked_domain.conf"
${SCRIPT_DIR}/node_modules/.bin/ejs-cli -f "${SCRIPT_DIR}/setup/start/nginx/appconfig.ejs" \
    -O "{ \"vhost\": \"${FQDN}\", \"appId\": \"admin\", \"sourceDir\": \"${BOX_SRC_DIR}\" }" > "${NGINX_ROOT}/admin.conf"

$GNU_SED -e "s/user www-data/user ${USER}/" -i "${NGINX_ROOT}/nginx.conf"
$GNU_SED -e "s/^pid .*/pid \/tmp\/nginx.pid;/" -i "${NGINX_ROOT}/nginx.conf"

# add webadmin oauth client
readonly WEBADMIN_ID=abcdefg
readonly WEBADMIN_SCOPES="root,profile,users,apps,settings,roleUser"
sqlite3 "${DATA_DIR}/cloudron.sqlite" "INSERT OR REPLACE INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (\"cid-webadmin\", \"webadmin\", \"secret-webadmin\", \"https://${FQDN}\", \"${WEBADMIN_SCOPES}\")"
sqlite3 "${DATA_DIR}/cloudron.sqlite" "INSERT OR REPLACE INTO apps (id, appStoreId, version, installationState, installationProgress, runState, healthy, containerId, manifestJson, httpPort, location, dnsRecordId, accessRestriction) VALUES (\"testApp\", \"testAppAppstoreId\", \"1.2.3\", \"installed\", \"done\", \"running\", \"1\", \"testAppContainerId\", \"{}\", 1337, \"testAppLocation\", \"testAppDnsRecordId\", \"public\")"

# start nginx
sudo nginx -c nginx.conf -p "${NGINX_ROOT}"

