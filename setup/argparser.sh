#!/bin/bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
json="${script_dir}/../node_modules/.bin/json"

arg_restore_url=""
arg_box_versions_url=""
arg_tls_cert=""
arg_tls_key=""
arg_api_server_origin=""
arg_web_server_origin=""
arg_fqdn=""
arg_token=""
arg_version=""
arg_is_custom_domain="false"

args=$(getopt -o "" -l "data:" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --data)
        read -r arg_api_server_origin arg_web_server_origin arg_fqdn arg_token arg_is_custom_domain arg_box_versions_url arg_restore_url arg_restore_key arg_version <<EOF
        $(echo "$2" | $json apiServerOrigin webServerOrigin fqdn token isCustomDomain boxVersionsUrl restoreUrl restoreKey version | tr '\n' ' ')
EOF
        arg_tls_cert=$(echo "$2" | $json tlsCert)
        arg_tls_key=$(echo "$2" | $json tlsKey)
        [[ "${arg_restore_url}" == "null" ]] && arg_restore_url=""
        [[ "${arg_restore_key}" == "null" ]] && arg_restore_key=""
        ;;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

echo "Parsed arguments:"
echo "restore url: ${arg_restore_url}"
echo "box versions url: ${arg_box_versions_url}"
echo "tls cert: ${arg_tls_cert}"
echo "tls key: ${arg_tls_key}"
echo "api server: ${arg_api_server_origin}"
echo "web server: ${arg_web_server_origin}"
echo "fqdn: ${arg_fqdn}"
echo "token: ${arg_token}"
echo "version: ${arg_version}"
echo "custom domain: ${arg_is_custom_domain}"


