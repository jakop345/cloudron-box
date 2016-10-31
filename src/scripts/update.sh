#!/bin/bash

set -eu -o pipefail

if [[ ${EUID} -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

readonly INSTALLER_SOURCE_DIR="/home/yellowtent/installer"
readonly LOG_FILE="/var/log/cloudron-update.log"

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

echo " " &>> "${LOG_FILE}"
echo "============ update marker ============" &>> "${LOG_FILE}"
echo " " &>> "${LOG_FILE}"
echo "Updating Cloudron with ${sourceTarballUrl}" &>> "${LOG_FILE}"
echo "${data}" &>> "${LOG_FILE}"

echo "=> Run installer.sh"
if ! ${INSTALLER_SOURCE_DIR}/src/scripts/installer.sh --sourcetarballurl "${sourceTarballUrl}" --data "${data}" &>> "${LOG_FILE}"; then
    echo "Failed to install cloudron. See ${LOG_FILE} for details"
    exit 1
fi
