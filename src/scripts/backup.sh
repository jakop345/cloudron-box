#!/bin/bash

set -e

if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [[ "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

exec 2>&1 1>> "/var/log/cloudron/backup.log"

if [ $# -lt 1 ]; then
    echo "Usage: backup.sh <url>"
    exit 1
fi

backup_url="$1"
now=$(date "+%Y-%m-%dT%H:%M:%S")

echo "Snapshoting backup as backup-${now}"
btrfs subvolume snapshot -r "${HOME}/data" "${HOME}/backup-${now}"

echo "Uploading backup to ${backup_url}"
tar -cvzf - -C "${HOME}/backup-${now}" . | curl -H "Content-Type:" -X PUT --data-binary @- "${backup_url}"

echo "Deleting backup snapshot"
btrfs subvolume delete "${HOME}/backup-${now}"

echo "Backup over"

