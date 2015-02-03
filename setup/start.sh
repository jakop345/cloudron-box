#!/bin/bash

# Count installer files so that we can correlate install and postinstall logs
install_count=$(find /var/log/cloudron -name "installer*" | wc -l)
exec > >(tee "/var/log/cloudron/start-$install_count.log")
exec 2>&1

set -eux

echo "==== Cloudron Start ===="

readonly USER="yellowtent"
# NOTE: Do NOT use BOX_SRC_DIR for accessing code and config files. This script will be run from a temp directory
# and the whole code will relocated to BOX_SRC_DIR by the installer. Use paths relative to script_dir or box_src_tmp_dir
readonly BOX_SRC_DIR="/home/${USER}/box"
readonly DATA_DIR="/home/${USER}/data"
readonly CONFIG_DIR="/home/${USER}/configs"
readonly MAIL_SERVER_IP="172.17.120.120" # hardcoded in mail container
readonly SETUP_PROGRESS_JSON="/home/yellowtent/setup/website/progress.json"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
box_src_tmp_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

source "${script_dir}/argparser.sh" "$@" # this injects the arg_* variables used below

admin_fqdn=$([[ "${arg_is_custom_domain}" == "true" ]] && echo "admin.${arg_fqdn}" ||  echo "admin-${arg_fqdn}")

set_progress() {
    local progress="$1"
    local message="$2"

    echo "==== ${message} ===="
    (echo "{ \"progress\": \"${progress}\", \"message\": \"${message}\" }" > "${SETUP_PROGRESS_JSON}") 2> /dev/null || true # as this will fail in non-update mode
}

set_progress "1" "Creating directories"
sudo -u "${USER}" -H bash <<EOF
set -eux
# keep these in sync with paths.js
mkdir -p "${DATA_DIR}/appicons"
mkdir -p "${DATA_DIR}/appdata"
mkdir -p "${DATA_DIR}/mail"
mkdir -p "${CONFIG_DIR}/nginx/applications"
mkdir -p "${CONFIG_DIR}/nginx/cert"
mkdir -p "${CONFIG_DIR}/collectd/collectd.conf.d"
EOF

set_progress "5" "Configuring Sudoers file"
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!${BOX_SRC_DIR}/src/scripts/rmappdir.sh env_keep=HOME
${USER} ALL=(root) NOPASSWD: ${BOX_SRC_DIR}/src/scripts/rmappdir.sh

Defaults!${BOX_SRC_DIR}/src/scripts/reloadnginx.sh env_keep=HOME
${USER} ALL=(root) NOPASSWD: ${BOX_SRC_DIR}/src/scripts/reloadnginx.sh

Defaults!${BOX_SRC_DIR}/src/scripts/backup.sh env_keep=HOME
${USER} ALL=(root) NOPASSWD: ${BOX_SRC_DIR}/src/scripts/backup.sh

Defaults!${BOX_SRC_DIR}/src/scripts/reboot.sh env_keep=HOME
${USER} ALL=(root) NOPASSWD: ${BOX_SRC_DIR}/src/scripts/reboot.sh

Defaults!${BOX_SRC_DIR}/src/scripts/reloadcollectd.sh env_keep=HOME
${USER} ALL=(root) NOPASSWD: ${BOX_SRC_DIR}/src/scripts/reloadcollectd.sh

EOF

set_progress "10" "Migrating data"
sudo -u "${USER}" -H bash <<EOF
set -eux
cd "${box_src_tmp_dir}"
PATH="${PATH}:${box_src_tmp_dir}/node_modules/.bin" npm run-script migrate_data
EOF

set_progress "15" "Setup nginx"
nginx_config_dir="${CONFIG_DIR}/nginx"
nginx_appconfig_dir="${CONFIG_DIR}/nginx/applications"

# copy nginx config
mkdir -p "${nginx_appconfig_dir}"
cp "${script_dir}/start/nginx/nginx.conf" "${nginx_config_dir}/nginx.conf"
cp "${script_dir}/start/nginx/mime.types" "${nginx_config_dir}/mime.types"
touch "${nginx_config_dir}/naked_domain.conf"
sed -e "s/##ADMIN_FQDN##/${admin_fqdn}/" -e "s|##BOX_SRC_DIR##|${BOX_SRC_DIR}|" "${script_dir}/start/nginx/admin.conf_template" > "${nginx_appconfig_dir}/admin.conf"

certificate_dir="${nginx_config_dir}/cert"
mkdir -p "${certificate_dir}"
echo "${arg_tls_cert}" > ${certificate_dir}/host.cert
echo "${arg_tls_key}" > ${certificate_dir}/host.key

# link nginx config to system config
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${nginx_config_dir}" /etc/nginx

chown "${USER}:${USER}" -R "/home/${USER}"

set_progress "20" "Removing existing container"
# removing containers ensures containers are launched with latest config updates
# restore code in appatask does not delete old containers
existing_containers=$(docker ps -qa)
echo "Remove containers: ${existing_containers}"
if [[ -n "${existing_containers}" ]]; then
    echo "${existing_containers}" | xargs docker rm -f
fi

set_progress "30" "Setup collectd and graphite"
${script_dir}/start/setup_collectd.sh

set_progress "40" "Setup mail relay"
docker rm -f mail || true
docker pull girish/mail:0.1 || true # this line is for dev convenience since it's already part of base image
mail_container_id=$(docker run --restart=always -d --name="mail" --cap-add="NET_ADMIN"\
    -p 127.0.0.1:25:25 \
    -h "${arg_fqdn}" \
    -e "DOMAIN_NAME=${arg_fqdn}" \
    -v "${DATA_DIR}/mail:/app/data" \
    girish/mail:0.1)
echo "Mail container id: ${mail_container_id}"
# Every docker restart results in a new IP. Give our mail server a
# static IP. Alternately, we need to link the mail container with
# all our apps
# This IP is set by the mail container on every start and the firewall
# allows connect to port 25. The ping gets the ARP lookup working
echo "Checking connectivity to mail relay (${MAIL_SERVER_IP})"
arp -d "${MAIL_SERVER_IP}" || true
if ! ping -c 20 "${MAIL_SERVER_IP}"; then
    echo "Could not connect to mail server"
fi

set_progress "50" "Setup MySQL addon"
docker rm -f mysql || true
mysql_root_password=$(pwgen -1 -s)
docker0_ip=$(/sbin/ifconfig docker0 | grep "inet addr" | awk -F: '{print $2}' | awk '{print $1}')
docker pull girish/mysql:0.2 || true # this line for dev convenience since it's already part of base image
mysql_container_id=$(docker run --restart=always -d --name="mysql" \
    -p 127.0.0.1:3306:3306 \
    -h "${arg_fqdn}" \
    -e "MYSQL_ROOT_PASSWORD=${mysql_root_password}" \
    -e "MYSQL_ROOT_HOST=${docker0_ip}" \
    -v "${DATA_DIR}/mysql:/var/lib/mysql" \
    girish/mysql:0.2)
echo "MySQL container id: ${mysql_container_id}"

set_progress "60" "Setup Postgres addon"
docker rm -f postgresql || true
postgresql_root_password=$(pwgen -1 -s)
docker pull girish/postgresql:0.2 || true # this line for dev convenience since it's already part of base image
postgresql_container_id=$(docker run --restart=always -d --name="postgresql" \
    -p 127.0.0.1:5432:5432 \
    -h "${arg_fqdn}" \
    -e "POSTGRESQL_ROOT_PASSWORD=${postgresql_root_password}" \
    -v "${DATA_DIR}/postgresql:/var/lib/mysql" \
    girish/postgresql:0.2)
echo "PostgreSQL container id: ${postgresql_container_id}"

set_progress "70" "Pulling Redis addon"
docker pull girish/redis:0.1 || true # this line for dev convenience since it's already part of base image

set_progress "80" "Creating cloudron.conf"
cloudron_sqlite="${DATA_DIR}/cloudron.sqlite"
admin_origin="https://${admin_fqdn}"
sudo -u yellowtent -H bash <<EOF
set -eux
echo "Creating cloudron.conf"
cat > "${CONFIG_DIR}/cloudron.conf" <<CONF_END
{
    "version": "${arg_version}",
    "token": "${arg_token}",
    "appServerUrl": "${arg_app_server_url}",
    "fqdn": "${arg_fqdn}",
    "isCustomDomain": ${arg_is_custom_domain},
    "boxVersionsUrl": "${arg_box_versions_url}",
    "mailServer": "${MAIL_SERVER_IP}",
    "mailUsername": "admin@${arg_fqdn}",
    "addons": {
        "mysql": {
            "rootPassword": "${mysql_root_password}"
        },
        "postgresql": {
            "rootPassword": "${postgresql_root_password}"
        }
    }
}
CONF_END

echo "Marking apps for restore"
# TODO: do not auto-start stopped containers (httpPort might need fixing to start them)
sqlite3 "${cloudron_sqlite}" 'UPDATE apps SET installationState = "pending_restore", healthy = NULL, runState = NULL, containerId = NULL, httpPort = NULL, installationProgress = NULL'

# Add webadmin oauth client
echo "Add webadmin oauth cient"
ADMIN_SCOPES="root,profile,users,apps,settings,roleAdmin"
ADMIN_ID=$(cat /proc/sys/kernel/random/uuid)
sqlite3 "${cloudron_sqlite}" "INSERT OR REPLACE INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) VALUES (\"\$ADMIN_ID\", \"webadmin\", \"cid-webadmin\", \"secret-webadmin\", \"WebAdmin\", \"${admin_origin}\", \"\$ADMIN_SCOPES\")"

EOF

# bookkeep the version as part of data
echo "{ \"version\": \"${arg_version}\", \"boxVersionsUrl\": \"${arg_box_versions_url}\" }" > "${DATA_DIR}/version"

set_progress "90" "Setup supervisord"
${script_dir}/start/setup_supervisord.sh

set_progress "95" "Reloading supervisor"
${script_dir}/start/reload_supervisord.sh

set_progress "99" "Reloading nginx"
nginx -s reload

set_progress "100" "Done"

