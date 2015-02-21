#!/bin/bash

set -eux

readonly LOGS_DIR="/home/yellowtent/logs"
readonly GRAPHITE_DIR="/home/yellowtent/data/graphite"
readonly COLLECTD_CONFIG_DIR="/home/yellowtent/configs/collectd"
readonly COLLECTD_APPCONFIG_DIR="${COLLECTD_CONFIG_DIR}/collectd.conf.d"

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "${GRAPHITE_DIR}"

docker pull girish/graphite:0.3 || true
docker run --restart=always -d --name="graphite" \
    -p 127.0.0.1:2003:2003 \
    -p 127.0.0.1:2004:2004 \
    -p 127.0.0.1:8000:8000 \
    -v "${GRAPHITE_DIR}:/app/data" \
    -v "${LOGS_DIR}/graphite:/var/log" \
    girish/graphite:0.3 

mkdir -p "${COLLECTD_APPCONFIG_DIR}"
cp -r "${script_dir}/collectd/collectd.conf" "${COLLECTD_CONFIG_DIR}/collectd.conf"
rm -rf /etc/collectd
ln -sfF "${COLLECTD_CONFIG_DIR}" /etc/collectd
chown -R yellowtent.yellowtent "${COLLECTD_CONFIG_DIR}"

update-rc.d -f collectd defaults
/etc/init.d/collectd restart

