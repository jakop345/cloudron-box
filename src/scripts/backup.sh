#!/bin/bash

set -eu -o pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

exec 2>&1 1>> "/var/log/cloudron/backup.log"

if [ $# -lt 2 ]; then
    echo "Usage: backup.sh <url> <key>"
    exit 1
fi

backup_url="$1"
backup_key="$2"
now=$(date "+%Y-%m-%dT%H:%M:%S")
DATA_DIR="${HOME}/data"

echo "Creating MySQL dump"
mysqldump -u root -ppassword box > "${DATA_DIR}/box.mysqldump"

echo "Snapshoting backup as backup-${now}"
btrfs subvolume snapshot -r "${DATA_DIR}" "${HOME}/backup-${now}"

echo "Uploading backup to ${backup_url}"
tar -cvzf - -C "${HOME}/backup-${now}" . | openssl aes-256-cbc -e -pass "pass:${backup_key}" | curl --fail -H "Content-Type:" -X PUT --data-binary @- "${backup_url}"

echo "Deleting backup snapshot"
btrfs subvolume delete "${HOME}/backup-${now}"

echo "Backup over"

