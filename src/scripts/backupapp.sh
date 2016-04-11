#!/bin/bash

set -eu -o pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root." >&2
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

if [ $# -lt 7 ]; then
    echo "Usage: backupapp.sh <s3 config url> <s3 data url> <access key id> <access key> <session token> <region> <password>"
    exit 1
fi

readonly DATA_DIR="${HOME}/data"

# env vars used by the awscli
s3_config_url="$1"
s3_data_url="$2"
export AWS_ACCESS_KEY_ID="$3"
export AWS_SECRET_ACCESS_KEY="$4"
export AWS_SESSION_TOKEN="$5"
export AWS_DEFAULT_REGION="$6"
password="$7"

readonly now=$(date "+%Y-%m-%dT%H:%M:%S")
readonly app_data_dir="${DATA_DIR}/${app_id}"
readonly app_data_snapshot="${DATA_DIR}/snapshots/${app_id}-${now}"

btrfs subvolume snapshot -r "${app_data_dir}" "${app_data_snapshot}"

# Upload config.json first because uploading tarball might take a lot of time, leading to token expiry
for try in `seq 1 5`; do
    echo "Uploading config.json to ${s3_config_url} (try ${try})"
    error_log=$(mktemp)

    # use aws instead of curl because curl will always read entire stream memory to set Content-Length
    # aws will do multipart upload
    if cat "${app_data_snapshot}/config.json" \
           |  aws s3 cp - "${s3_config_url}" 2>"${error_log}"; then
        break
    fi
    cat "${error_log}" && rm "${error_log}"
done

if [[ ${try} -eq 5 ]]; then
    echo "Backup failed uploading config.json"
    btrfs subvolume delete "${app_data_snapshot}"
    exit 1
fi

for try in `seq 1 5`; do
    echo "Uploading backup to ${s3_data_url} (try ${try})"
    error_log=$(mktemp)

    if tar -cvzf - -C "${app_data_snapshot}" . \
           | openssl aes-256-cbc -e -pass "pass:${backup_key}" \
           |  aws s3 cp - "${s3_data_url}" 2>"${error_log}"; then
        break
    fi
    cat "${error_log}" && rm "${error_log}"
done

btrfs subvolume delete "${app_data_snapshot}"

if [[ ${try} -eq 5 ]]; then
    echo "Backup failed uploading backup tarball"
    exit 1
else
    echo "Backup successful"
fi
