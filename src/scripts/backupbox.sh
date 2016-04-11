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

if [ $# -lt 6 ]; then
    echo "Usage: backupbox.sh <s3 url> <access key id> <access key> <session token> <region> <password>"
    exit 1
fi

# env vars used by the awscli
s3_url="$1"
export AWS_ACCESS_KEY_ID="$2"
export AWS_SECRET_ACCESS_KEY="$3"
export AWS_SESSION_TOKEN="$4"
export AWS_DEFAULT_REGION="$5"
password="$6"
now=$(date "+%Y-%m-%dT%H:%M:%S")
BOX_DATA_DIR="${HOME}/data/box"
box_snapshot_dir="${HOME}/data/snapshots/box-${now}"

echo "Creating MySQL dump"
mysqldump -u root -ppassword --single-transaction --routines --triggers box > "${BOX_DATA_DIR}/box.mysqldump"

echo "Snapshoting backup as backup-${now}"
btrfs subvolume snapshot -r "${BOX_DATA_DIR}" "${box_snapshot_dir}"

for try in `seq 1 5`; do
    echo "Uploading backup to ${s3_url} (try ${try})"
    error_log=$(mktemp)

    # use aws instead of curl because curl will always read entire stream memory to set Content-Length
    # aws will do multipart upload
    if tar -czf - -C "${box_snapshot_dir}" . \
           | openssl aes-256-cbc -e -pass "pass:${password}" \
           | aws s3 cp - "${s3_url}" 2>"${error_log}"; then
        break
    fi
    cat "${error_log}" && rm "${error_log}"
done

echo "Deleting backup snapshot"
btrfs subvolume delete "${box_snapshot_dir}"

if [[ ${try} -eq 5 ]]; then
    echo "Backup failed"
    exit 1
else
    echo "Backup successful"
fi

