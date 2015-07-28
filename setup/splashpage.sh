#!/bin/bash

set -eu -o pipefail

readonly SETUP_WEBSITE_DIR="/home/yellowtent/setup/website"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BOX_SRC_DIR="/home/yellowtent/box"
readonly DATA_DIR="/home/yellowtent/data"
readonly ADMIN_LOCATION="my" # keep this in sync with constants.js

source "${script_dir}/INFRA_VERSION" # this injects INFRA_VERSION

echo "Setting up nginx update page"

source "${script_dir}/argparser.sh" "$@" # this injects the arg_* variables used below

# keep this is sync with config.js appFqdn()
admin_fqdn=$([[ "${arg_is_custom_domain}" == "true" ]] && echo "${ADMIN_LOCATION}.${arg_fqdn}" ||  echo "${ADMIN_LOCATION}-${arg_fqdn}")
admin_origin="https://${admin_fqdn}"

# copy the website
rm -rf "${SETUP_WEBSITE_DIR}" && mkdir -p "${SETUP_WEBSITE_DIR}"
cp -r "${script_dir}/splash/website/"* "${SETUP_WEBSITE_DIR}"

# create nginx config
infra_version="none"
[[ -f "${DATA_DIR}/INFRA_VERSION" ]] && infra_version=$(cat "${DATA_DIR}/INFRA_VERSION")
if [[ "${arg_retire}" == "true" || "${infra_version}" != "${INFRA_VERSION}" ]]; then
    rm -f ${DATA_DIR}/nginx/applications/*
    ${BOX_SRC_DIR}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
        -O "{ \"vhost\": \"~^(.+)\$\", \"adminOrigin\": \"${admin_origin}\", \"endpoint\": \"splash\", \"sourceDir\": \"${SETUP_WEBSITE_DIR}\" }" > "${DATA_DIR}/nginx/applications/admin.conf"
else
    ${BOX_SRC_DIR}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
        -O "{ \"vhost\": \"${admin_fqdn}\", \"adminOrigin\": \"${admin_origin}\", \"endpoint\": \"splash\", \"sourceDir\": \"${SETUP_WEBSITE_DIR}\" }" > "${DATA_DIR}/nginx/applications/admin.conf"
fi

echo '{ "update": { "percent": "10", "message": "Updating cloudron software" }, "backup": null }' > "${SETUP_WEBSITE_DIR}/progress.json"

nginx -s reload
