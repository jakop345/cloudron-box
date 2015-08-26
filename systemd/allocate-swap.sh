#!/bin/bash

set -eu -o pipefail

readonly APPS_SWAP_FILE="/apps.swap"
readonly BACKUP_SWAP_FILE="/backup.swap" # used when doing app backups

# Allocate two sets of swap files - one for general app usage and another for backup
# The backup swap is setup for swap on the fly by the backup scripts
if [[ ! -f "${APPS_SWAP_FILE}" ]]; then
    physical_memory=$(free -m | awk '/Mem:/ { print $2 }')
    echo "Creating Apps swap file of size ${physical_memory}m"
    fallocate -l "${physical_memory}m" "${APPS_SWAP_FILE}"
    chmod 600 "${APPS_SWAP_FILE}"
    mkswap "${APPS_SWAP_FILE}"
    swapon "${APPS_SWAP_FILE}"
    echo "${APPS_SWAP_FILE}  none  swap  sw  0 0" >> /etc/fstab
else
    echo "Apps Swap file already exists"
fi

if [[ ! -f "${BACKUP_SWAP_FILE}" ]]; then
    echo "Creating Backup swap file"
    fallocate -l 1024m "${BACKUP_SWAP_FILE}"
    chmod 600 "${BACKUP_SWAP_FILE}"
    mkswap "${BACKUP_SWAP_FILE}"
else
    echo "Backups Swap file already exists"
fi
