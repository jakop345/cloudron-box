#!/bin/bash

set -eu -o pipefail

echo "==== Cloudron Start ===="

readonly USER="yellowtent"
# NOTE: Do NOT use BOX_SRC_DIR for accessing code and config files. This script will be run from a temp directory
# and the whole code will relocated to BOX_SRC_DIR by the installer. Use paths relative to script_dir or box_src_tmp_dir
readonly BOX_SRC_DIR="/home/${USER}/box"
readonly DATA_DIR="/home/${USER}/data"
readonly CONFIG_DIR="/home/${USER}/configs"
readonly SETUP_PROGRESS_JSON="/home/yellowtent/setup/website/progress.json"
readonly ADMIN_LOCATION="my" # keep this in sync with constants.js

readonly curl="curl --fail --connect-timeout 20 --retry 10 --retry-delay 2 --max-time 2400"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
box_src_tmp_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

source "${script_dir}/argparser.sh" "$@" # this injects the arg_* variables used below

# keep this is sync with config.js appFqdn()
admin_fqdn=$([[ "${arg_is_custom_domain}" == "true" ]] && echo "${ADMIN_LOCATION}.${arg_fqdn}" ||  echo "${ADMIN_LOCATION}-${arg_fqdn}")

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
find "${DATA_DIR}/box" -mindepth 1 -delete || true
[[ ! -d "${DATA_DIR}/box" ]] && btrfs subvolume create "${DATA_DIR}/box"
mkdir -p "${DATA_DIR}/box/appicons"
mkdir -p "${DATA_DIR}/box/mail"
mkdir -p "${DATA_DIR}/box/graphite"
mkdir -p "${DATA_DIR}/snapshots"

# remove old snapshots. if we do want to keep this around, we will have to fix the chown -R below
# which currently fails because these are readonly fs
find "${DATA_DIR}/snapshots" -mindepth 1 -maxdepth 1 | xargs --no-run-if-empty btrfs subvolume delete

set_progress "15" "Downloading restore data"
if [[ -n "${arg_restore_url}" ]]; then
    echo "Downloading backup: ${arg_restore_url} and key: ${arg_restore_key}"

    while true; do
        if $curl -L "${arg_restore_url}" | openssl aes-256-cbc -d -pass "pass:${arg_restore_key}" | tar -zxf - -C "${DATA_DIR}/box"; then break; fi
        echo "Failed to download data, trying again"
    done
fi

set_progress "21" "Setting up MySQL"
mysqladmin -u root -ppassword password password # reset default root password
mysql -u root -ppassword -e 'CREATE DATABASE IF NOT EXISTS box'
if [[ -f "${DATA_DIR}/box/box.mysqldump" ]]; then
    echo "Importing existing database into MySQL"
    mysql -u root -ppassword box < "${DATA_DIR}/box/box.mysqldump"
fi

set_progress "25" "Migrating data"
sudo -u "${USER}" -H bash <<EOF
set -eu
cd "${box_src_tmp_dir}"
NODE_ENV=cloudron DATABASE_URL=mysql://root:password@localhost/box "${box_src_tmp_dir}/node_modules/.bin/db-migrate" up
EOF

set_progress "30" "Setup nginx"
nginx_config_dir="${CONFIG_DIR}/nginx"
nginx_appconfig_dir="${CONFIG_DIR}/nginx/applications"

# copy nginx config
mkdir -p "${nginx_appconfig_dir}"
cp "${script_dir}/start/nginx/nginx.conf" "${nginx_config_dir}/nginx.conf"
cp "${script_dir}/start/nginx/mime.types" "${nginx_config_dir}/mime.types"
# setup naked domain to use admin by default. app restoration will overwrite this config
${box_src_tmp_dir}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
    -O "{ \"vhost\": \"${arg_fqdn}\", \"isAdmin\": true, \"sourceDir\": \"${BOX_SRC_DIR}\" }" > "${nginx_config_dir}/naked_domain.conf"
${box_src_tmp_dir}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
    -O "{ \"vhost\": \"${admin_fqdn}\", \"isAdmin\": true, \"sourceDir\": \"${BOX_SRC_DIR}\" }" > "${nginx_appconfig_dir}/admin.conf"

certificate_dir="${nginx_config_dir}/cert"
mkdir -p "${certificate_dir}"
echo "${arg_tls_cert}" > ${certificate_dir}/host.cert
echo "${arg_tls_key}" > ${certificate_dir}/host.key

# link nginx config to system config
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${nginx_config_dir}" /etc/nginx

set_progress "33" "Changing ownership of source, data, configs"
chown "${USER}:${USER}" -R "${BOX_SRC_DIR}" "${DATA_DIR}" "${CONFIG_DIR}"

set_progress "35" "Removing existing container"
# removing containers ensures containers are launched with latest config updates
# restore code in appatask does not delete old containers
existing_containers=$(docker ps -qa)
echo "Remove containers: ${existing_containers}"
if [[ -n "${existing_containers}" ]]; then
    echo "${existing_containers}" | xargs docker rm -f
fi

set_progress "45" "Setup graphite"
docker run --restart=always -d --name="graphite" \
    -p 127.0.0.1:2003:2003 \
    -p 127.0.0.1:2004:2004 \
    -p 127.0.0.1:8000:8000 \
    -v "${DATA_DIR}/box/graphite:/app/data" girish/graphite:0.1.0

set_progress "45" "Setup mail relay"
mail_container_id=$(docker run --restart=always -d --name="mail" \
    -p 127.0.0.1:25:25 \
    -h "${arg_fqdn}" \
    -e "DOMAIN_NAME=${arg_fqdn}" \
    -v "${DATA_DIR}/box/mail:/app/data" \
    girish/mail:0.1.0)
echo "Mail container id: ${mail_container_id}"

set_progress "50" "Setup MySQL addon"
mysql_root_password=$(pwgen -1 -s)
docker0_ip=$(/sbin/ifconfig docker0 | grep "inet addr" | awk -F: '{print $2}' | awk '{print $1}')
cat > "${CONFIG_DIR}/addons/mysql_vars.sh" <<EOF
readonly MYSQL_ROOT_PASSWORD='${mysql_root_password}'
readonly MYSQL_ROOT_HOST='${docker0_ip}'
EOF
rm -rf "${DATA_DIR}/mysql"
mysql_container_id=$(docker run --restart=always -d --name="mysql" \
    -h "${arg_fqdn}" \
    -v "${DATA_DIR}/mysql:/var/lib/mysql" \
    -v "${CONFIG_DIR}/addons/mysql_vars.sh:/etc/mysql/mysql_vars.sh:r" \
    girish/mysql:0.1.0)
echo "MySQL container id: ${mysql_container_id}"

set_progress "55" "Setup Postgres addon"
postgresql_root_password=$(pwgen -1 -s)
cat > "${CONFIG_DIR}/addons/postgresql_vars.sh" <<EOF
readonly POSTGRESQL_ROOT_PASSWORD='${postgresql_root_password}'
EOF
rm -rf "${DATA_DIR}/postgresql"
postgresql_container_id=$(docker run --restart=always -d --name="postgresql" \
    -h "${arg_fqdn}" \
    -v "${DATA_DIR}/postgresql:/var/lib/postgresql" \
    -v "${CONFIG_DIR}/addons/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh:r" \
    girish/postgresql:0.1.0)
echo "PostgreSQL container id: ${postgresql_container_id}"

set_progress "55" "Setup Mongodb addon"
mongodb_root_password=$(pwgen -1 -s)
cat > "${CONFIG_DIR}/addons/mongodb_vars.sh" <<EOF
readonly MONGODB_ROOT_PASSWORD='${mongodb_root_password}'
EOF
rm -rf "${DATA_DIR}/mongodb"
mongodb_container_id=$(docker run --restart=always -d --name="mongodb" \
    -h "${arg_fqdn}" \
    -v "${DATA_DIR}/mongodb:/var/lib/mongodb" \
    -v "${CONFIG_DIR}/addons/mongodb_vars.sh:/etc/mongodb_vars.sh:r" \
    girish/mongodb:0.1.0)
echo "Mongodb container id: ${mongodb_container_id}"

set_progress "65" "Creating cloudron.conf"
cloudron_sqlite="${DATA_DIR}/cloudron.sqlite"
admin_origin="https://${admin_fqdn}"
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
    "mailUsername": "admin@${arg_fqdn}",
    "database": {
        "hostname": "localhost",
        "username": "root",
        "password": "password",
        "port": 3306,
        "name": "box"
    },
    "addons": {
        "mysql": {
            "rootPassword": "${mysql_root_password}"
        },
        "postgresql": {
            "rootPassword": "${postgresql_root_password}"
        },
        "mongodb": {
            "rootPassword": "${mongodb_root_password}"
        }
    },
    "developerMode": ${arg_developer_mode}
}
CONF_END

echo "Creating config.json for webadmin"
cat > "${BOX_SRC_DIR}/webadmin/dist/config.json" <<CONF_END
{
    "webServerOrigin": "${arg_web_server_origin}"
}
CONF_END

# all other states other than install should proceed from where they left off
echo "Marking installed apps for restore"
mysql -u root -ppassword -e 'UPDATE apps SET installationState = "pending_restore" WHERE installationState = "installed"' box

# Add webadmin oauth client
# The domain might have changed, therefor we have to update the record
# !!! This needs to be in sync with the webadmin, specifically login_callback.js
echo "Add webadmin oauth cient"
ADMIN_SCOPES="root,developer,profile,users,apps,settings,roleUser"
mysql -u root -ppassword -e "REPLACE INTO clients (id, appId, clientSecret, redirectURI, scope) VALUES (\"cid-webadmin\", \"webadmin\", \"secret-webadmin\", \"${admin_origin}\", \"\$ADMIN_SCOPES\")" box
EOF

# bookkeep the version as part of data
echo "{ \"version\": \"${arg_version}\", \"boxVersionsUrl\": \"${arg_box_versions_url}\" }" > "${DATA_DIR}/box/version"

set_progress "80" "Reloading supervisor"
${script_dir}/start/reload_supervisord.sh

set_progress "85" "Reloading nginx"
nginx -s reload

set_progress "100" "Done"

