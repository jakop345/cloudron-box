#!/bin/bash

# Count installer files so that we can correlate install and postinstall logs
install_count=$(find /var/log/cloudron -name "installer*" | wc -l)
exec > >(tee "/var/log/cloudron/postinstall-$install_count.log")
exec 2>&1

set -e
set -x

echo "==== Cloudron post installation ===="

readonly USER="yellowtent"
readonly BOX_SRC_DIR="/home/${USER}/box"
readonly DATA_DIR="/home/${USER}/data"
readonly CONFIG_DIR="/home/${USER}/configs"
readonly HARAKA_DIR="${CONFIG_DIR}/haraka"
readonly NGINX_CONFIG_DIR="${CONFIG_DIR}/nginx"
readonly NGINX_APPCONFIG_DIR="${CONFIG_DIR}/nginx/applications"
readonly CLOUDRON_CONF="${CONFIG_DIR}/cloudron.conf"
readonly CLOUDRON_SQLITE="${DATA_DIR}/cloudron.sqlite"
readonly MYSQL_DIR="${DATA_DIR}/mysql"
readonly POSTGRESQL_DIR="${DATA_DIR}/postgresql"
readonly JSON="${BOX_SRC_DIR}/node_modules/.bin/json"
readonly MAIL_SERVER_IP="172.17.120.120" # hardcoded in haraka container

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

provision_box_versions_url=""
provision_tls_cert=""
provision_tls_key=""
provision_app_server_url=""
provision_fqdn=""
provision_token=""
provision_version=""
admin_fqdn=""
admin_origin=""

args=$(getopt -o "" -l "boxversionsurl:,data:,tlscert:,tlskey:,version:" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --boxversionsurl) provision_box_versions_url="$2";;
    --data)
        read -r provision_app_server_url provision_fqdn provision_token <<EOF
        $(echo "$2" | $JSON appServerUrl fqdn token | tr '\n' ' ')
EOF
        admin_fqdn="admin-${provision_fqdn}"
        admin_origin="https://${admin_fqdn}"
        ;;
    --tlscert) provision_tls_cert="$2";;
    --tlskey) provision_tls_key="$2";;
    --version) provision_version="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

echo "==== Sudoers file for app removal ===="
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

echo "==== Migrate data ===="
sudo -u "${USER}" -H bash <<EOF
set -e
set -x
cd "${BOX_SRC_DIR}"
PATH="${PATH}:${BOX_SRC_DIR}/node_modules/.bin" npm run-script migrate_data
EOF

echo "==== Setup nginx ===="
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${NGINX_CONFIG_DIR}" /etc/nginx
mkdir -p "${NGINX_APPCONFIG_DIR}"
cp "${BOX_SRC_DIR}/setup/postinstall/nginx/nginx.conf" "${NGINX_CONFIG_DIR}/nginx.conf"
cp "${BOX_SRC_DIR}/setup/postinstall/nginx/mime.types" "${NGINX_CONFIG_DIR}/mime.types"
touch "${NGINX_CONFIG_DIR}/naked_domain.conf"
sed -e "s/##ADMIN_FQDN##/${admin_fqdn}/" -e "s|##BOX_SRC_DIR##|${BOX_SRC_DIR}|" "${BOX_SRC_DIR}/setup/postinstall/nginx/admin.conf_template" > "${NGINX_APPCONFIG_DIR}/admin.conf"

echo "==== Setup ssl certs ===="
certificate_dir="${NGINX_CONFIG_DIR}/cert"
mkdir -p "${certificate_dir}"
cd "${certificate_dir}"
echo "${provision_tls_cert}" > host.cert
echo "${provision_tls_key}" > host.key

chown "${USER}:${USER}" -R "/home/${USER}"

echo "=== Remove all containers ==="
# removing containers ensures containers are launched with latest config updates
# restore code in appatask does not delete old containers
existing_containers=$(docker ps -qa)
echo "Remove containers: ${existing_containers}"
if [[ -n "${existing_containers}" ]]; then
    echo "${existing_containers}" | xargs docker rm -f
fi

echo "=== Setup collectd and graphite ==="
${BOX_SRC_DIR}/setup/postinstall/setup_collectd.sh

echo "=== Setup haraka mail relay ==="
docker rm -f haraka || true
docker pull girish/haraka:0.1 || true # this line is for dev convenience since it's already part of base image
haraka_container_id=$(docker run --restart=always -d --name="haraka" --cap-add="NET_ADMIN"\
    -p 127.0.0.1:25:25 \
    -h "${provision_fqdn}" \
    -e "DOMAIN_NAME=${provision_fqdn}" \
    -v "${HARAKA_DIR}:/app/data" \
    girish/haraka:0.1)
echo "Haraka container id: ${haraka_container_id}"
# Every docker restart results in a new IP. Give our mail server a
# static IP. Alternately, we need to link the mail container with
# all our apps
# This IP is set by the haraka container on every start and the firewall
# allows connect to port 25. The ping gets the ARP lookup working
echo "Checking connectivity to haraka(${MAIL_SERVER_IP})"
if ! ping -c 20 "${MAIL_SERVER_IP}"; then
    echo "Could not connect to mail server"
fi

echo "=== Setup MySQL addon ==="
docker rm -f mysql || true
mysql_root_password=$(pwgen -1 -s)
docker0_ip=$(/sbin/ifconfig docker0 | grep "inet addr" | awk -F: '{print $2}' | awk '{print $1}')
docker pull girish/mysql:0.1 || true # this line for dev convenience since it's already part of base image
mysql_container_id=$(docker run --restart=always -d --name="mysql" \
    -p 127.0.0.1:3306:3306 \
    -h "${provision_fqdn}" \
    -e "MYSQL_ROOT_PASSWORD=${mysql_root_password}" \
    -e "MYSQL_ROOT_HOST=${docker0_ip}" \
    -v "${MYSQL_DIR}:/var/lib/mysql" \
    girish/mysql:0.1)
echo "MySQL container id: ${mysql_container_id}"

echo "=== Setup Postgres addon ==="
docker rm -f postgresql || true
postgresql_root_password=$(pwgen -1 -s)
docker pull girish/postgresql:0.1 || true # this line for dev convenience since it's already part of base image
postgresql_container_id=$(docker run --restart=always -d --name="postgresql" \
    -p 127.0.0.1:5432:5432 \
    -h "${provision_fqdn}" \
    -e "POSTGRESQL_ROOT_PASSWORD=${postgresql_root_password}" \
    -v "${POSTGRESQL_DIR}:/var/lib/mysql" \
    girish/postgresql:0.1)
echo "PostgreSQL container id: ${postgresql_container_id}"

echo "=== Pulling Redis addon ==="
docker pull girish/redis:0.1 || true # this line for dev convenience since it's already part of base image

echo "==== Creating cloudron.conf ===="
sudo -u yellowtent -H bash <<EOF
set -e
set -x
echo "Creating cloudron.conf"
cat > "${CLOUDRON_CONF}" <<CONF_END
{
    "version": "${provision_version}",
    "token": "${provision_token}",
    "appServerUrl": "${provision_app_server_url}",
    "fqdn": "${provision_fqdn}",
    "adminOrigin": "${admin_origin}",
    "boxVersionsUrl": "${provision_box_versions_url}",
    "mailServer": "${MAIL_SERVER_IP}",
    "mailUsername": "admin@${provision_fqdn}",
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
sqlite3 "${CLOUDRON_SQLITE}" 'UPDATE apps SET installationState = "pending_restore", healthy = NULL, runState = NULL, containerId = NULL, httpPort = NULL, installationProgress = NULL'

# Add webadmin oauth client
echo "Add webadmin oauth cient"
ADMIN_SCOPES="root,profile,users,apps,settings,roleAdmin"
ADMIN_ID=$(cat /proc/sys/kernel/random/uuid)
sqlite3 "${CLOUDRON_SQLITE}" "INSERT OR REPLACE INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) VALUES (\"\$ADMIN_ID\", \"webadmin\", \"cid-webadmin\", \"secret-webadmin\", \"WebAdmin\", \"${admin_origin}\", \"\$ADMIN_SCOPES\")"

EOF

# bookkeep the version as part of data
echo "{ \"version\": \"${provision_version}\", \"boxVersionsUrl\": \"${provision_box_versions_url}\" }" > "${DATA_DIR}/version"

echo "==== Setup supervisord ===="
${BOX_SRC_DIR}/setup/postinstall/setup_supervisord.sh

