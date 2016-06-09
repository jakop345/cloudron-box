#!/bin/bash

set -eu -o pipefail

echo "==== Cloudron Start ===="

readonly USER="yellowtent"
readonly BOX_SRC_DIR="/home/${USER}/box"
readonly DATA_DIR="/home/${USER}/data"
readonly CONFIG_DIR="/home/${USER}/configs"
readonly SETUP_PROGRESS_JSON="/home/yellowtent/setup/website/progress.json"
readonly ADMIN_LOCATION="my" # keep this in sync with constants.js

readonly curl="curl --fail --connect-timeout 20 --retry 10 --retry-delay 2 --max-time 2400"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${script_dir}/argparser.sh" "$@" # this injects the arg_* variables used below

# keep this is sync with config.js appFqdn()
admin_fqdn=$([[ "${arg_is_custom_domain}" == "true" ]] && echo "${ADMIN_LOCATION}.${arg_fqdn}" ||  echo "${ADMIN_LOCATION}-${arg_fqdn}")
admin_origin="https://${admin_fqdn}"

readonly is_update=$([[ -d "${DATA_DIR}/box" ]] && echo "true" || echo "false")

set_progress() {
    local percent="$1"
    local message="$2"

    echo "==== ${percent} - ${message} ===="
    (echo "{ \"update\": { \"percent\": \"${percent}\", \"message\": \"${message}\" }, \"backup\": {} }" > "${SETUP_PROGRESS_JSON}") 2> /dev/null || true # as this will fail in non-update mode
}

set_progress "1" "Create container"
$script_dir/container.sh

set_progress "10" "Ensuring directories"
# keep these in sync with paths.js
[[ "${is_update}" == "false" ]] && btrfs subvolume create "${DATA_DIR}/box"
mkdir -p "${DATA_DIR}/box/appicons"
mkdir -p "${DATA_DIR}/box/certs"
mkdir -p "${DATA_DIR}/box/mail/dkim/${arg_fqdn}"
mkdir -p "${DATA_DIR}/box/acme" # acme keys
mkdir -p "${DATA_DIR}/graphite"

mkdir -p "${DATA_DIR}/mysql"
mkdir -p "${DATA_DIR}/postgresql"
mkdir -p "${DATA_DIR}/mongodb"
mkdir -p "${DATA_DIR}/snapshots"
mkdir -p "${DATA_DIR}/addons"
mkdir -p "${DATA_DIR}/collectd/collectd.conf.d"
mkdir -p "${DATA_DIR}/acme" # acme challenges

# bookkeep the version as part of data
echo "{ \"version\": \"${arg_version}\", \"boxVersionsUrl\": \"${arg_box_versions_url}\" }" > "${DATA_DIR}/box/version"

# remove old snapshots. if we do want to keep this around, we will have to fix the chown -R below
# which currently fails because these are readonly fs
echo "Cleaning up snapshots"
find "${DATA_DIR}/snapshots" -mindepth 1 -maxdepth 1 | xargs --no-run-if-empty btrfs subvolume delete

# restart mysql to make sure it has latest config
service mysql restart

readonly mysql_root_password="password"
mysqladmin -u root -ppassword password password # reset default root password
mysql -u root -p${mysql_root_password} -e 'CREATE DATABASE IF NOT EXISTS box'

if [[ -n "${arg_restore_url}" ]]; then
    set_progress "15" "Downloading restore data"

    echo "Downloading backup: ${arg_restore_url} and key: ${arg_restore_key}"

    while true; do
        if $curl -L "${arg_restore_url}" | openssl aes-256-cbc -d -pass "pass:${arg_restore_key}" | tar -zxf - -C "${DATA_DIR}/box"; then break; fi
        echo "Failed to download data, trying again"
    done

    set_progress "21" "Setting up MySQL"
    if [[ -f "${DATA_DIR}/box/box.mysqldump" ]]; then
        echo "Importing existing database into MySQL"
        mysql -u root -p${mysql_root_password} box < "${DATA_DIR}/box/box.mysqldump"
    fi
fi

set_progress "25" "Migrating data"
sudo -u "${USER}" -H bash <<EOF
set -eu
cd "${BOX_SRC_DIR}"
BOX_ENV=cloudron DATABASE_URL=mysql://root:${mysql_root_password}@localhost/box "${BOX_SRC_DIR}/node_modules/.bin/db-migrate" up
EOF

set_progress "28" "Setup collectd"
cp "${script_dir}/start/collectd.conf" "${DATA_DIR}/collectd/collectd.conf"
service collectd restart

set_progress "30" "Setup nginx"
mkdir -p "${DATA_DIR}/nginx/applications"
cp "${script_dir}/start/nginx/nginx.conf" "${DATA_DIR}/nginx/nginx.conf"
cp "${script_dir}/start/nginx/mime.types" "${DATA_DIR}/nginx/mime.types"

# generate these for update code paths as well to overwrite splash
admin_cert_file="${DATA_DIR}/nginx/cert/host.cert"
admin_key_file="${DATA_DIR}/nginx/cert/host.key"
if [[ -f "${DATA_DIR}/box/certs/${admin_fqdn}.cert" && -f "${DATA_DIR}/box/certs/${admin_fqdn}.key" ]]; then
    admin_cert_file="${DATA_DIR}/box/certs/${admin_fqdn}.cert"
    admin_key_file="${DATA_DIR}/box/certs/${admin_fqdn}.key"
fi
${BOX_SRC_DIR}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
    -O "{ \"vhost\": \"${admin_fqdn}\", \"adminOrigin\": \"${admin_origin}\", \"endpoint\": \"admin\", \"sourceDir\": \"${BOX_SRC_DIR}\", \"certFilePath\": \"${admin_cert_file}\", \"keyFilePath\": \"${admin_key_file}\" }" > "${DATA_DIR}/nginx/applications/admin.conf"

mkdir -p "${DATA_DIR}/nginx/cert"
if [[ -f "${DATA_DIR}/box/certs/host.cert" && -f "${DATA_DIR}/box/certs/host.key" ]]; then
    cp "${DATA_DIR}/box/certs/host.cert" "${DATA_DIR}/nginx/cert/host.cert"
    cp "${DATA_DIR}/box/certs/host.key" "${DATA_DIR}/nginx/cert/host.key"
else
    echo "${arg_tls_cert}" > "${DATA_DIR}/nginx/cert/host.cert"
    echo "${arg_tls_key}" > "${DATA_DIR}/nginx/cert/host.key"
fi

set_progress "33" "Changing ownership"
chown "${USER}:${USER}" -R "${DATA_DIR}/box" "${DATA_DIR}/nginx" "${DATA_DIR}/collectd" "${DATA_DIR}/addons" "${DATA_DIR}/acme"
chown "${USER}:${USER}" "${DATA_DIR}/INFRA_VERSION" || true
chown "${USER}:${USER}" "${DATA_DIR}"

set_progress "65" "Creating cloudron.conf"
sudo -u yellowtent -H bash <<EOF
set -eu
echo "Creating cloudron.conf"
cat > "${CONFIG_DIR}/cloudron.conf" <<CONF_END
{
    "version": "${arg_version}",
    "token": "${arg_token}",
    "apiServerOrigin": "${arg_api_server_origin}",
    "webServerOrigin": "${arg_web_server_origin}",
    "fqdn": "${arg_fqdn}",
    "isCustomDomain": ${arg_is_custom_domain},
    "boxVersionsUrl": "${arg_box_versions_url}",
    "provider": "${arg_provider}",
    "database": {
        "hostname": "localhost",
        "username": "root",
        "password": "${mysql_root_password}",
        "port": 3306,
        "name": "box"
    },
    "appBundle": ${arg_app_bundle}
}
CONF_END

echo "Creating config.json for webadmin"
cat > "${BOX_SRC_DIR}/webadmin/dist/config.json" <<CONF_END
{
    "webServerOrigin": "${arg_web_server_origin}"
}
CONF_END
EOF

# Add Backup Configuration
if [[ ! -z "${arg_backup_config}" ]]; then
    echo "Add Backup Config"

    mysql -u root -p${mysql_root_password} \
        -e "REPLACE INTO settings (name, value) VALUES (\"backup_config\", '$arg_backup_config')" box
fi

# Add DNS Configuration
if [[ ! -z "${arg_dns_config}" ]]; then
    echo "Add DNS Config"

    mysql -u root -p${mysql_root_password} \
        -e "REPLACE INTO settings (name, value) VALUES (\"dns_config\", '$arg_dns_config')" box
fi

# Add Update Configuration
if [[ ! -z "${arg_update_config}" ]]; then
    echo "Add Update Config"

    mysql -u root -p${mysql_root_password} \
        -e "REPLACE INTO settings (name, value) VALUES (\"update_config\", '$arg_update_config')" box
fi

# Add TLS Configuration
if [[ ! -z "${arg_tls_config}" ]]; then
    echo "Add TLS Config"

    mysql -u root -p${mysql_root_password} \
        -e "REPLACE INTO settings (name, value) VALUES (\"tls_config\", '$arg_tls_config')" box
fi

# The domain might have changed, therefor we have to update the record
# !!! This needs to be in sync with the webadmin, specifically login_callback.js
echo "Add webadmin api cient"
readonly ADMIN_SCOPES="cloudron,developer,profile,users,apps,settings"
mysql -u root -p${mysql_root_password} \
    -e "REPLACE INTO clients (id, appId, type, clientSecret, redirectURI, scope) VALUES (\"cid-webadmin\", \"Settings\", \"built-in\", \"secret-webadmin\", \"${admin_origin}\", \"${ADMIN_SCOPES}\")" box

echo "Add SDK api client"
mysql -u root -p${mysql_root_password} \
    -e "REPLACE INTO clients (id, appId, type, clientSecret, redirectURI, scope) VALUES (\"cid-sdk\", \"SDK\", \"built-in\", \"secret-sdk\", \"${admin_origin}\", \"*,roleSdk\")" box

echo "Add cli api client"
mysql -u root -p${mysql_root_password} \
    -e "REPLACE INTO clients (id, appId, type, clientSecret, redirectURI, scope) VALUES (\"cid-cli\", \"Cloudron Tool\", \"built-in\", \"secret-cli\", \"${admin_origin}\", \"*,roleSdk\")" box

set_progress "80" "Starting Cloudron"
systemctl start cloudron.target

sleep 2 # give systemd sometime to start the processes

set_progress "85" "Reloading nginx"
nginx -s reload

set_progress "100" "Done"

