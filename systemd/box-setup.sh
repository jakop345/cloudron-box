#!/bin/bash

set -eu -o pipefail

readonly APPS_SWAP_FILE="/apps.swap"
readonly BACKUP_SWAP_FILE="/backup.swap" # used when doing app backups
readonly USER_HOME_FILE="/root/user_home.img"
readonly DOCKER_DATA_FILE="/root/docker_data.img"

readonly physical_memory=$(free -m | awk '/Mem:/ { print $2 }')
readonly app_count=$((${physical_memory} / 200)) # estimated app count
readonly docker_data_size=$((6 * 1024 + app_count * 500)) # 6gb base + 500m for each app
readonly disk_size_gb=$(fdisk -l /dev/vda1 | grep 'Disk /dev/vda1' | awk '{ print $3 }')
readonly disk_size_mb=$((disk_size_gb * 1024))
readonly backup_swap=1024

# Allocate two sets of swap files - one for general app usage and another for backup
# The backup swap is setup for swap on the fly by the backup scripts
if [[ ! -f "${APPS_SWAP_FILE}" ]]; then
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
    fallocate -l "${backup_swap}m" "${BACKUP_SWAP_FILE}"
    chmod 600 "${BACKUP_SWAP_FILE}"
    mkswap "${BACKUP_SWAP_FILE}"
else
    echo "Backups Swap file already exists"
fi

if [ ! -f "${DOCKER_DATA_FILE}" ]; then
    echo "Settings up btrfs docker"
    if aufs_mounts=$(grep 'aufs' /proc/mounts | awk '{ print $2 }' | sort -r); then
        umount -l "${aufs_mounts}"
    fi
    rm -rf /var/lib/docker
    mkdir /var/lib/docker

    truncate -s "${docker_data_size}M" "${DOCKER_DATA_FILE}"
    mkfs.btrfs -L DockerData "${DOCKER_DATA_FILE}"
    echo "${DOCKER_DATA_FILE} /var/lib/docker btrfs loop,nosuid 0 0" >> /etc/fstab
    echo 'DOCKER_OPTS="-s btrfs"' >> /etc/default/docker
    mount "${DOCKER_DATA_FILE}"
else
    echo "Docker is already btrfs"
fi

if [[ ! -f "${USER_HOME_FILE}" ]]; then
    echo "Seting up btrfs user home"
    # create a separate 12GB fs for data
    home_data_size=$((disk_size_mb - 2048 - docker_data_size - physical_memory - backup_swap))
    truncate -s "${home_data_size}M" "${USER_HOME_FILE}"
    mkfs.btrfs -L UserHome "${USER_HOME_FILE}"
    echo "${USER_HOME_FILE} ${USER_HOME} btrfs loop,nosuid 0 0" >> /etc/fstab
    mount "${USER_HOME_FILE}"
    btrfs subvolume create "${USER_HOME}/data"
else
    echo "Home is already btrfs"
fi
