#!/bin/bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
json="${script_dir}/../node_modules/.bin/json"

arg_box_versions_url=""
arg_tls_cert=""
arg_tls_key=""
arg_app_server_url=""       # deprecated, replaced by arg_api_server_origin
arg_api_server_origin=""
arg_web_server_origin=""
arg_fqdn=""
arg_token=""
arg_version=""
arg_is_custom_domain="false"

args=$(getopt -o "" -l "boxversionsurl:,data:,version:" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --boxversionsurl) arg_box_versions_url="$2";;
    --data)
        read -r arg_app_server_url arg_api_server_origin arg_web_server_origin arg_fqdn arg_token arg_is_custom_domain <<EOF
        $(echo "$2" | $json appServerUrl apiServerOrigin webServerOrigin fqdn token isCustomDomain | tr '\n' ' ')
EOF
        arg_tls_cert=$(echo "$2" | $json tlsCert)
        arg_tls_key=$(echo "$2" | $json tlsKey)
        ;;
    --version) arg_version="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done


