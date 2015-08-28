#!/bin/bash

set -eu -o pipefail

readonly USER_HOME="/home/yellowtent"
readonly APPS_SWAP_FILE="/apps.swap"
readonly BACKUP_SWAP_FILE="/backup.swap" # used when doing app backups
readonly USER_DATA_FILE="/root/user_data.img"
readonly USER_DATA_DIR="/home/yellowtent/data"

# all sizes are in mb
readonly physical_memory=$(free -m | awk '/Mem:/ { print $2 }')
readonly swap_size="${physical_memory}"
readonly app_count=$((${physical_memory} / 200)) # estimated app count
readonly disk_size_gb=$(fdisk -l /dev/vda1 | grep 'Disk /dev/vda1' | awk '{ print $3 }')
readonly disk_size=$((disk_size_gb * 1024))
readonly backup_swap_size=1024
readonly system_size=5120 # 5 gigs for system libs, installer, box code and tmp
readonly ext4_reserved=$((disk_size * 5 / 100)) # this can be changes using tune2fs -m percent /dev/vda1

echo "Physical memory: ${physical_memory}"
echo "Estimated app count: ${app_count}"
echo "Disk size: ${disk_size}"

# Allocate two sets of swap files - one for general app usage and another for backup
# The backup swap is setup for swap on the fly by the backup scripts
if [[ ! -f "${APPS_SWAP_FILE}" ]]; then
    echo "Creating Apps swap file of size ${swap_size}M"
    fallocate -l "${swap_size}m" "${APPS_SWAP_FILE}"
    chmod 600 "${APPS_SWAP_FILE}"
    mkswap "${APPS_SWAP_FILE}"
    swapon "${APPS_SWAP_FILE}"
    echo "${APPS_SWAP_FILE}  none  swap  sw  0 0" >> /etc/fstab
else
    echo "Apps Swap file already exists"
fi

if [[ ! -f "${BACKUP_SWAP_FILE}" ]]; then
    echo "Creating Backup swap file of size ${backup_swap_size}M"
    fallocate -l "${backup_swap_size}m" "${BACKUP_SWAP_FILE}"
    chmod 600 "${BACKUP_SWAP_FILE}"
    mkswap "${BACKUP_SWAP_FILE}"
else
    echo "Backups Swap file already exists"
fi

echo "Resizing data volume"
home_data_size=$((disk_size - system_size - swap_size - backup_swap_size - ext4_reserved))
echo "Resizing up btrfs user data to size ${home_data_size}M"
umount "${USER_DATA_DIR}"
fallocate -l "${home_data_size}m" "${USER_DATA_FILE}" # does not overwrite existing data
mount "${USER_DATA_FILE}"
btrfs filesystem resize max "${USER_DATA_DIR}"

