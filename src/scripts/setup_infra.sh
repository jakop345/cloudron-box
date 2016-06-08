#!/bin/bash

set -eu -o pipefail

if [[ ${EUID} -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly infra_version="${script_dir}/../infra_version.js"

readonly data_dir="$1"
readonly fqdn="$2"
readonly mail_fqdn="$3"
readonly mail_tls_cert="$4"
readonly mail_tls_key="$5"

# graphite
readonly graphite_image=$(node -e "console.log(require('${infra_version}').images.graphite.tag);")
graphite_container_id=$(docker run --restart=always -d --name="graphite" \
    -m 75m \
    --memory-swap 150m \
    -p 127.0.0.1:2003:2003 \
    -p 127.0.0.1:2004:2004 \
    -p 127.0.0.1:8000:8000 \
    -v "${data_dir}/graphite:/app/data" \
    --read-only -v /tmp -v /run \
    "${graphite_image}")
echo "Graphite container id: ${graphite_container_id}"

# mail (note: 2525 is hardcoded in mail container and app use this port)
# MAIL_SERVER_NAME is the hostname of the mailserver i.e server uses these certs
# MAIL_DOMAIN is the domain for which this server is relaying mails
# mail container uses /app/data for backed up data and /run for restart-able data
readonly mail_image=$(node -e "console.log(require('${infra_version}').images.mail.tag);")
mail_addon_root_password=$(pwgen -1 -s)
cat > "${data_dir}/addons/mail_vars.sh" <<EOF
MAIL_ROOT_USERNAME=no-reply
MAIL_ROOT_PASSWORD=${mail_addon_root_password}
EOF
mail_container_id=$(docker run --restart=always -d --name="mail" \
    -m 75m \
    --memory-swap 150m \
    -h "${fqdn}" \
    -e "MAIL_DOMAIN=${fqdn}" \
    -e "MAIL_SERVER_NAME=${mail_fqdn}" \
    -v "${data_dir}/box/mail:/app/data" \
    -v "${data_dir}/mail:/run" \
    -v "${data_dir}/addons/mail_vars.sh:/etc/mail/mail_vars.sh:ro" \
    -v "${mail_tls_key}:/etc/tls_key.pem:ro" \
    -v "${mail_tls_cert}:/etc/tls_cert.pem:ro" \
    -p 587:2525 \
    -p 993:9993 \
    -p 4190:4190 \
    -p 25:2525 \
    --read-only -v /tmp \
    "${mail_image}")
echo "Mail container id: ${mail_container_id}"

# mysql
readonly mysql_image=$(node -e "console.log(require('${infra_version}').images.mysql.tag);")
mysql_addon_root_password=$(pwgen -1 -s)
docker0_ip=$(/sbin/ifconfig docker0 | grep "inet " | awk -F: '{print $2}' | awk '{print $1}')
cat > "${data_dir}/addons/mysql_vars.sh" <<EOF
MYSQL_ROOT_PASSWORD='${mysql_addon_root_password}'
MYSQL_ROOT_HOST='${docker0_ip}'
EOF
mysql_container_id=$(docker run --restart=always -d --name="mysql" \
    -m 256m \
    --memory-swap 512m \
    -h "${fqdn}" \
    -v "${data_dir}/mysql:/var/lib/mysql" \
    -v "${data_dir}/addons/mysql_vars.sh:/etc/mysql/mysql_vars.sh:ro" \
    --read-only -v /tmp -v /run \
    "${mysql_image}")
echo "MySQL container id: ${mysql_container_id}"

# postgresql
readonly postgresql_image=$(node -e "console.log(require('${infra_version}').images.postgresql.tag);")
postgresql_addon_root_password=$(pwgen -1 -s)
cat > "${data_dir}/addons/postgresql_vars.sh" <<EOF
POSTGRESQL_ROOT_PASSWORD='${postgresql_addon_root_password}'
EOF
postgresql_container_id=$(docker run --restart=always -d --name="postgresql" \
    -m 100m \
    --memory-swap 200m \
    -h "${fqdn}" \
    -v "${data_dir}/postgresql:/var/lib/postgresql" \
    -v "${data_dir}/addons/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh:ro" \
    --read-only -v /tmp -v /run \
    "${postgresql_image}")
echo "PostgreSQL container id: ${postgresql_container_id}"

# mongodb
readonly mongodb_image=$(node -e "console.log(require('${infra_version}').images.mongodb.tag);")
mongodb_addon_root_password=$(pwgen -1 -s)
cat > "${data_dir}/addons/mongodb_vars.sh" <<EOF
MONGODB_ROOT_PASSWORD='${mongodb_addon_root_password}'
EOF
mongodb_container_id=$(docker run --restart=always -d --name="mongodb" \
    -m 100m \
    --memory-swap 200m \
    -h "${fqdn}" \
    -v "${data_dir}/mongodb:/var/lib/mongodb" \
    -v "${data_dir}/addons/mongodb_vars.sh:/etc/mongodb_vars.sh:ro" \
    --read-only -v /tmp -v /run \
    "${mongodb_image}")
echo "Mongodb container id: ${mongodb_container_id}"
