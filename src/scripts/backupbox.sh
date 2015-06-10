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

if [ $# -lt 2 ]; then
    echo "Usage: backupbox.sh <url> <key>"
    exit 1
fi

backup_url="$1"
backup_key="$2"
now=$(date "+%Y-%m-%dT%H:%M:%S")
BOX_DATA_DIR="${HOME}/data/box"
box_snapshot_dir="${HOME}/data/snapshots/box-${now}"

echo "Mount backup swap"
backup_swap_file="/backup.swap"
if swapon -s | grep -q "${backup_swap_file}"; then swapoff "${backup_swap_file}"; fi
swapon "${backup_swap_file}"

echo "Creating MySQL dump"
mysqldump -u root -ppassword --single-transaction --routines --triggers box > "${BOX_DATA_DIR}/box.mysqldump"

echo "Snapshoting backup as backup-${now}"
btrfs subvolume snapshot -r "${BOX_DATA_DIR}" "${box_snapshot_dir}"

for try in `seq 1 5`; do
    echo "Uploading backup to ${backup_url} (try ${try})"
    error_log=$(mktemp)
    if tar -cvzf - -C "${box_snapshot_dir}" . \
           | openssl aes-256-cbc -e -pass "pass:${backup_key}" \
           | curl --fail -H "Content-Type:" -X PUT --data-binary @- "${backup_url}" 2>"${error_log}"; then
        break
    fi
    cat "${error_log}" && rm "${error_log}"
done

echo "Deleting backup snapshot"
btrfs subvolume delete "${box_snapshot_dir}"

echo "Unmounting backup swap"
swapoff "${backup_swap_file}"

if [[ ${try} -eq 5 ]]; then
    echo "Backup failed"
    exit 1
else
    echo "Backup successful"
fi

