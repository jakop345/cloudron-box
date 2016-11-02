#!/bin/bash

set -eu -o pipefail

if [[ ${EUID} -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

readonly INSTALLER_SOURCE_DIR="/home/yellowtent/installer"
readonly UPDATER_SERVICE="cloudron-updater"
readonly DATA_FILE="/tmp/cloudron-update-data.json"

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

if [[ $# != 2 ]]; then
    echo "sourceTarballUrl and data arguments required"
    exit 1
fi

readonly sourceTarballUrl="${1}"
readonly data="${2}"

echo "Updating Cloudron with ${sourceTarballUrl}"
echo "${data}"

echo "=> reset service ${UPDATER_SERVICE} status in case it failed"
systemctl reset-failed "${UPDATER_SERVICE}"

# Save user data in file, to avoid argument length limit with systemd-run
echo "${data}" > "${DATA_FILE}"

echo "=> Run installer.sh as cloudron-updater.service"
if ! systemd-run --unit "${UPDATER_SERVICE}" ${INSTALLER_SOURCE_DIR}/scripts/installer.sh --sourcetarballurl "${sourceTarballUrl}" --data-file "${DATA_FILE}"; then
    echo "Failed to install cloudron. See ${LOG_FILE} for details"
    exit 1
fi

echo "=> service ${UPDATER_SERVICE} started."
echo "=> See logs with journalctl -u ${UPDATER_SERVICE} -f"
