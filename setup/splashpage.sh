#!/bin/bash

set -eu

readonly NGINX_CONFIG_DIR="/home/yellowtent/setup/configs/nginx" # do not reuse configs since it will be removed by installer
readonly SETUP_WEBSITE_DIR="/home/yellowtent/setup/website"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Setting up nginx update page"

source "${script_dir}/argparser.sh" "$@" # this injects the arg_* variables used below

# copy the website
rm -rf "${SETUP_WEBSITE_DIR}" && mkdir -p "${SETUP_WEBSITE_DIR}"
cp -r "${script_dir}/splash/website/"* "${SETUP_WEBSITE_DIR}"

# create nginx config
rm -rf "${NGINX_CONFIG_DIR}" && mkdir -p "${NGINX_CONFIG_DIR}"
sed -e "s|##SETUP_WEBSITE_DIR##|${SETUP_WEBSITE_DIR}|" "${script_dir}/splash/nginx/nginx.conf" > "${NGINX_CONFIG_DIR}/nginx.conf"
cp "${script_dir}/splash/nginx/mime.types" "${NGINX_CONFIG_DIR}/mime.types"
mkdir -p "${NGINX_CONFIG_DIR}/cert"
echo "${arg_tls_cert}" > "${NGINX_CONFIG_DIR}/cert/host.cert"
echo "${arg_tls_key}" > "${NGINX_CONFIG_DIR}/cert/host.key"

# link in the new nginx config
unlink /etc/nginx 2>/dev/null || rm -rf /etc/nginx
ln -s "${NGINX_CONFIG_DIR}" /etc/nginx

touch "${SETUP_WEBSITE_DIR}/progress.json"

nginx -s reload
