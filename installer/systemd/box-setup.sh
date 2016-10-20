#!/bin/bash

set -eu -o pipefail

readonly USER_HOME="/home/yellowtent"
readonly APPS_SWAP_FILE="/apps.swap"
readonly USER_DATA_FILE="/root/user_data.img"
readonly USER_DATA_DIR="/home/yellowtent/data"

# detect device of rootfs (http://forums.fedoraforum.org/showthread.php?t=270316)
disk_device="$(for d in $(find /dev -type b); do [ "$(mountpoint -d /)" = "$(mountpoint -x $d)" ] && echo $d && break; done)"

existing_swap=$(cat /proc/meminfo | grep SwapTotal | awk '{ printf "%.0f", $2/1024 }')

# allow root access over ssh
sed -e 's/.* \(ssh-rsa.*\)/\1/' -i /root/.ssh/authorized_keys

# all sizes are in mb
readonly physical_memory=$(free -m | awk '/Mem:/ { print $2 }')
readonly swap_size=$((${physical_memory} - ${existing_swap})) # if you change this, fix enoughResourcesAvailable() in client.js
readonly app_count=$((${physical_memory} / 200)) # estimated app count
readonly disk_size_gb=$(fdisk -l ${disk_device} | grep "Disk ${disk_device}" | awk '{ printf "%.0f", $3 }')
readonly disk_size=$((disk_size_gb * 1024))
readonly system_size=10240 # 10 gigs for system libs, apps images, installer, box code and tmp
readonly ext4_reserved=$((disk_size * 5 / 100)) # this can be changes using tune2fs -m percent /dev/vda1

echo "Disk device: ${disk_device}"
echo "Physical memory: ${physical_memory}"
echo "Estimated app count: ${app_count}"
echo "Disk size: ${disk_size}"

# Allocate swap for general app usage
if [[ ! -f "${APPS_SWAP_FILE}" && ${swap_size} -gt 0 ]]; then
    echo "Creating Apps swap file of size ${swap_size}M"
    fallocate -l "${swap_size}m" "${APPS_SWAP_FILE}"
    chmod 600 "${APPS_SWAP_FILE}"
    mkswap "${APPS_SWAP_FILE}"
    swapon "${APPS_SWAP_FILE}"
    echo "${APPS_SWAP_FILE}  none  swap  sw  0 0" >> /etc/fstab
else
    echo "Apps Swap file already exists"
fi

echo "Resizing data volume"
home_data_size=$((disk_size - system_size - swap_size - ext4_reserved))
echo "Resizing up btrfs user data to size ${home_data_size}M"
umount "${USER_DATA_DIR}" || true
# Do not preallocate (non-sparse). Doing so overallocates for data too much in advance and causes problems when using many apps with smaller data
# fallocate -l "${home_data_size}m" "${USER_DATA_FILE}" # does not overwrite existing data
truncate -s "${home_data_size}m" "${USER_DATA_FILE}" # this will shrink it if the file had existed. this is useful when running this script on a live system
mount -t btrfs -o loop,nosuid "${USER_DATA_FILE}" ${USER_DATA_DIR}
btrfs filesystem resize max "${USER_DATA_DIR}"

