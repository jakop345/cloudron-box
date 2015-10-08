#!/bin/bash

set -eu -o pipefail

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

source ${SOURCE_DIR}/setup/INFRA_VERSION

readonly mysqldatadir="/tmp/mysqldata-$(date +%s)"
readonly postgresqldatadir="/tmp/postgresqldata-$(date +%s)"
readonly mongodbdatadir="/tmp/mongodbdata-$(date +%s)"
root_password=secret

start_postgresql() {
    postgresql_vars="POSTGRESQL_ROOT_PASSWORD=${root_password}; POSTGRESQL_ROOT_HOST=172.17.0.0/255.255.0.0"

    if which boot2docker >/dev/null 2>&1; then
        boot2docker ssh "sudo rm -rf /tmp/postgresql_vars.sh"
        boot2docker ssh "echo \"${postgresql_vars}\" > /tmp/postgresql_vars.sh"
    else
        rm -rf /tmp/postgresql_vars.sh
        echo "${postgresql_vars}" > /tmp/postgresql_vars.sh
    fi

    docker rm -f postgresql 2>/dev/null 1>&2 || true

    docker run -dtP --name=postgresql -v "${postgresqldatadir}:/var/lib/postgresql" \
         --read-only -v /tmp -v /run -v /var/log \
        -v /tmp/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh "${POSTGRESQL_IMAGE}" >/dev/null
}

start_mysql() {
    local mysql_vars="MYSQL_ROOT_PASSWORD=${root_password}; MYSQL_ROOT_HOST=172.17.0.0/255.255.0.0"

    if which boot2docker >/dev/null 2>&1; then
        boot2docker ssh "sudo rm -rf /tmp/mysql_vars.sh"
        boot2docker ssh "echo \"${mysql_vars}\" > /tmp/mysql_vars.sh"
    else
        rm -rf /tmp/mysql_vars.sh
        echo "${mysql_vars}" > /tmp/mysql_vars.sh
    fi

    docker rm -f mysql 2>/dev/null 1>&2 || true

    docker run -dP --name=mysql -v "${mysqldatadir}:/var/lib/mysql" \
        --read-only -v /tmp -v /run -v /var/log \
        -v /tmp/mysql_vars.sh:/etc/mysql/mysql_vars.sh "${MYSQL_IMAGE}" >/dev/null
}

start_mongodb() {
    local mongodb_vars="MONGODB_ROOT_PASSWORD=${root_password}"

    if which boot2docker >/dev/null 2>&1; then
        boot2docker ssh "sudo rm -rf /tmp/mongodb_vars.sh"
        boot2docker ssh "echo \"${mongodb_vars}\" > /tmp/mongodb_vars.sh"
    else
        rm -rf /tmp/mongodb_vars.sh
        echo "${mongodb_vars}" > /tmp/mongodb_vars.sh
    fi

    docker rm -f mongodb 2>/dev/null 1>&2 || true

    docker run -dP --name=mongodb -v "${mongodbdatadir}:/var/lib/mongodb" -v /tmp/mongodb_vars.sh:/etc/mongodb_vars.sh "${MONGODB_IMAGE}" >/dev/null
}

start_mysql
start_postgresql
start_mongodb

echo -n "Waiting for addons to start"
for i in {1..10}; do
   echo -n "."
    sleep 1
done
echo ""

