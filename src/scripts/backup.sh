#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 0
fi

set -e

NOW=$(date +%Y-%m-%dT%H:%M:%S)
LOG="/var/log/cloudron/backup-${NOW}.log"
exec 2>&1 1> $LOG

if [ $# -lt 1 ]; then
    echo "Usage: backup.sh <url>"
    exit 1
fi

BACKUP_URL="$1"

echo "Snapshoting backup as backup-${NOW}"
btrfs subvolume snapshot -r $HOME/data $HOME/backup-${NOW}
echo "Uploading backup to $BACKUP_URL"
tar -cvzf -C $HOME/backup-${NOW} - . | curl -X PUT --data-binary @- "$BACKUP_URL"
echo "Deleting backup snapshot"
btrfs subvolume delete $HOME/backup-${NOW}

echo "Backup over"

