#!/bin/bash

set -eu -o pipefail

readonly mysqldatadir="/tmp/mysqldata-$(date +%s)"
readonly postgresqldatadir="/tmp/postgresqldata-$(date +%s)"
root_password=secret

start_postgresql() {
    postgresql_vars="POSTGRESQL_ROOT_PASSWORD=${root_password}; POSTGRESQL_ROOT_HOST=172.17.0.0/255.255.0.0"

    if which boot2docker >/dev/null; then
        boot2docker ssh "sudo rm -rf /tmp/postgresql_vars.sh"
        boot2docker ssh "echo \"${postgresql_vars}\" > /tmp/postgresql_vars.sh"
    else
        rm -rf /tmp/postgresql_vars.sh
        echo "${postgresql_vars}" > /tmp/postgresql_vars.sh
    fi

    docker rm -f postgresql 2>/dev/null 1>&2 || true

    docker run -dtP --name=postgresql -v "${postgresqldatadir}:/var/lib/postgresql" -v /tmp/postgresql_vars.sh:/etc/postgresql/postgresql_vars.sh girish/postgresql:0.3 >/dev/null
}

start_mysql() {
    local mysql_vars="MYSQL_ROOT_PASSWORD=${root_password}; MYSQL_ROOT_HOST=172.17.0.0/255.255.0.0"

    if which boot2docker >/dev/null; then
        boot2docker ssh "sudo rm -rf /tmp/mysql_vars.sh"
        boot2docker ssh "echo \"${mysql_vars}\" > /tmp/mysql_vars.sh"
    else
        rm -rf /tmp/mysql_vars.sh
        echo "${mysql_vars}" > /tmp/mysql_vars.sh
    fi

    docker rm -f mysql 2>/dev/null 1>&2 || true

    docker run -dP --name=mysql -v "${mysqldatadir}:/var/lib/mysql" -v /tmp/mysql_vars.sh:/etc/mysql/mysql_vars.sh girish/mysql:0.3 >/dev/null
}

start_mysql
start_postgresql

echo -n "Waiting for addons to start"
for i in {1..10}; do
   echo -n "."
    sleep 1
done
echo ""

