#!/bin/bash

set -eu -o pipefail

readonly DATA_DIR="/home/yellowtent/data"

arg_fqdn="$1"
mysql_root_password="$2"
postgresql_root_password="$3"
mongodb_root_password="$4"

mkdir -p "${DATA_DIR}/addons"

# removing containers ensures containers are launched with latest config updates
# restore code in appatask does not delete old containers
existing_containers=$(docker ps -qa)
echo "Remove containers: ${existing_containers}"
if [[ -n "${existing_containers}" ]]; then
    echo "${existing_containers}" | xargs docker rm -f
fi

# graphite
docker run --restart=always -d --name="graphite" \
    -p 127.0.0.1:2003:2003 \
    -p 127.0.0.1:2004:2004 \
    -p 127.0.0.1:8000:8000 \
    -v "${DATA_DIR}/box/graphite:/app/data" girish/graphite:0.1.0

# mail
mail_container_id=$(docker run --restart=always -d --name="mail" \
    -p 127.0.0.1:25:25 \
    -h "${arg_fqdn}" \
    -e "DOMAIN_NAME=${arg_fqdn}" \
    -v "${DATA_DIR}/box/mail:/app/data" \
    girish/mail:0.1.0)
echo "Mail container id: ${mail_container_id}"

# mysql
docker0_ip=$(/sbin/ifconfig docker0 | grep "inet addr" | awk -F: '{print $2}' | awk '{print $1}')
cat > "${DATA_DIR}/addons/mysql_vars.sh" <<EOF
readonly MYSQL_ROOT_PASSWORD='${mysql_root_password}'
readonly MYSQL_ROOT_HOST='${docker0_ip}'
EOF
rm -rf "${DATA_DIR}/mysql"
mysql_container_id=$(docker run --restart=always -d --name="mysql" \
    -h "${arg_fqdn}" \
    -v "${DATA_DIR}/mysql:/var/lib/mysql" \
    -v "${DATA_DIR}/addons/mysql_vars.sh:/etc/mysql/mysql_vars.sh:r" \
    girish/mysql:0.1.0)
echo "MySQL container id: ${mysql_container_id}"

# postgresql
cat > "${DATA_DIR}/addons/postgresql_vars.sh" <<EOF
readonly POSTGRESQL_ROOT_PASSWORD='${postgresql_root_password}'
EOF
rm -rf "${DATA_DIR}/postgresql"
postgresql_container_id=$(docker run --restart=always -d --name="postgresql" \
    -h "${arg_fqdn}" \
    -v "${DATA_DIR}/postgresql:/var/lib/postgresql" \
    -v "${DATA_DIR}/addons/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh:r" \
    girish/postgresql:0.1.0)
echo "PostgreSQL container id: ${postgresql_container_id}"

cat > "${DATA_DIR}/addons/mongodb_vars.sh" <<EOF
readonly MONGODB_ROOT_PASSWORD='${mongodb_root_password}'
EOF
rm -rf "${DATA_DIR}/mongodb"
mongodb_container_id=$(docker run --restart=always -d --name="mongodb" \
    -h "${arg_fqdn}" \
    -v "${DATA_DIR}/mongodb:/var/lib/mongodb" \
    -v "${DATA_DIR}/addons/mongodb_vars.sh:/etc/mongodb_vars.sh:r" \
    girish/mongodb:0.1.0)
echo "Mongodb container id: ${mongodb_container_id}"

