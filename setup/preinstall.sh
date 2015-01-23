#!/bin/bash

set -e
set -u

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly NGINX_CONFIG_DIR=/home/yellowtent/setup_configs/nginx # do not reuse configs since it will be removed by installer

readonly CERT_DIR="/home/yellowtent/configs/nginx/cert"

setup_nginx() {
    if [[ ! -f "${CERT_DIR}/host.key" || ! -f "${CERT_DIR}/host.key" ]]; then
        echo "Skipping settings up nginx since no certs found"
        return
    fi

    echo "Setting up nginx update page"

    # show updating page in nginx
    local provision_tls_cert=$(cat "${CERT_DIR}/host.cert")
    local provision_tls_key=$(cat "${CERT_DIR}/host.key")

    unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
    rm -rf "${NGINX_CONFIG_DIR}" && mkdir -p "${NGINX_CONFIG_DIR}"
    ln -s "${NGINX_CONFIG_DIR}" /etc/nginx
    cp "${SCRIPT_DIR}/nginx/nginx.conf" "${NGINX_CONFIG_DIR}/nginx.conf"
    cp "${SCRIPT_DIR}/nginx/mime.types" "${NGINX_CONFIG_DIR}/mime.types"
    mkdir -p "${NGINX_CONFIG_DIR}/cert"
    echo "${provision_tls_cert}" > "${NGINX_CONFIG_DIR}/cert/host.cert"
    echo "${provision_tls_key}" > "${NGINX_CONFIG_DIR}/cert/host.key"
    nginx -s reload
}

setup_nginx

echo "Stopping box code"

service supervisor stop || true

echo -n "Waiting for supervisord to stop"
while test -e "/var/run/supervisord.pid" && kill -0 `cat /var/run/supervisord.pid`; do
    echo -n "."
    sleep 1
done
echo ""

