#!/bin/bash

set -eu -o pipefail

readonly SETUP_WEBSITE_DIR="/home/yellowtent/setup/website"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BOX_SRC_DIR="/home/yellowtent/box"
readonly DATA_DIR="/home/yellowtent/data"
readonly ADMIN_LOCATION="my" # keep this in sync with constants.js

echo "Setting up nginx update page"

source "${script_dir}/argparser.sh" "$@" # this injects the arg_* variables used below

# keep this is sync with config.js appFqdn()
admin_fqdn=$([[ "${arg_is_custom_domain}" == "true" ]] && echo "${ADMIN_LOCATION}.${arg_fqdn}" ||  echo "${ADMIN_LOCATION}-${arg_fqdn}")
admin_origin="https://${admin_fqdn}"

# copy the website
rm -rf "${SETUP_WEBSITE_DIR}" && mkdir -p "${SETUP_WEBSITE_DIR}"
cp -r "${script_dir}/splash/website/"* "${SETUP_WEBSITE_DIR}"

# create nginx config
readonly current_infra=$(node -e "console.log(require('${script_dir}/../src/infra_version.js').version);")
existing_infra="none"
[[ -f "${DATA_DIR}/INFRA_VERSION" ]] && existing_infra=$(node -e "console.log(JSON.parse(require('fs').readFileSync('${DATA_DIR}/INFRA_VERSION', 'utf8')).version);")
if [[ "${arg_retire}" != "" || "${existing_infra}" != "${current_infra}" ]]; then
    echo "Showing progress bar on all subdomains in retired mode or infra update. retire: ${arg_retire} existing: ${existing_infra} current: ${current_infra}"
    rm -f ${DATA_DIR}/nginx/applications/*
    ${BOX_SRC_DIR}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
        -O "{ \"vhost\": \"~^(.+)\$\", \"adminOrigin\": \"${admin_origin}\", \"endpoint\": \"splash\", \"sourceDir\": \"${SETUP_WEBSITE_DIR}\", \"certFilePath\": \"cert/host.cert\", \"keyFilePath\": \"cert/host.key\" }" > "${DATA_DIR}/nginx/applications/admin.conf"
else
    echo "Show progress bar only on admin domain for normal update"
    ${BOX_SRC_DIR}/node_modules/.bin/ejs-cli -f "${script_dir}/start/nginx/appconfig.ejs" \
        -O "{ \"vhost\": \"${admin_fqdn}\", \"adminOrigin\": \"${admin_origin}\", \"endpoint\": \"splash\", \"sourceDir\": \"${SETUP_WEBSITE_DIR}\", \"certFilePath\": \"cert/host.cert\", \"keyFilePath\": \"cert/host.key\" }" > "${DATA_DIR}/nginx/applications/admin.conf"
fi

if [[ "${arg_retire}" == "migrate" ]]; then
    echo '{ "migrate": { "percent": "10", "message": "Migrating cloudron. This could take up to 15 minutes." }, "backup": null }' > "${SETUP_WEBSITE_DIR}/progress.json"
else
    echo '{ "update": { "percent": "10", "message": "Updating cloudron software" }, "backup": null }' > "${SETUP_WEBSITE_DIR}/progress.json"
fi

nginx -s reload
