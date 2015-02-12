#!/bin/bash

set -eu

readonly TMPDIR=${TMPDIR:-/tmp} # why is this not set on mint?

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

echo "Snapshoting backup as backup-${now}"
btrfs subvolume snapshot -r "${HOME}/data" "${HOME}/backup-${now}"

echo "Creating backup"
tar -cvzf "${TMPDIR}/backup-${now}.tar.gz" "${HOME}/backup-${now}"

echo "Encrypting backup"
openssl aes-256-cbc -e -in "${TMPDIR}/backup-${now}.tar.gz" -out "${TMPDIR}/backup-${now}.tar.gz.enc" -pass "pass:${backup_key}"

echo "Uploading backup to ${backup_url}"
curl --fail -H "Content-Type:" -X PUT --data-binary @"${TMPDIR}/backup-${now}.tar.gz.enc" "${backup_url}"

echo "Deleting backup snapshot"
btrfs subvolume delete "${HOME}/backup-${now}"

echo "Backup over"

