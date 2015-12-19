#!/bin/bash

set -euv -o pipefail

echo ""
echo "======== Cloudron Installer ========"
echo ""

readonly infra_version_url="https://s3.amazonaws.com/cloudron-selfhosting/INFRA_VERSION"
readonly infra_version_file="${HOME}/INFRA_VERSION"

readonly installer_code_url="https://s3.amazonaws.com/cloudron-selfhosting/installer.tar"
readonly installer_code_file="${HOME}/installer.tar"

readonly image_initialize_url="https://s3.amazonaws.com/cloudron-selfhosting/initializeBaseUbuntuImage.sh"
readonly image_initialize_file="${HOME}/initializeBaseUbuntuImage.sh"

echo "[INFO] Cleanup old files ..."
rm -rf "${infra_version_file}"
rm -rf "${installer_code_file}"
rm -rf "${image_initialize_file}"

echo "[INFO] Fetching INFRA_VERSION ..."
curl "${infra_version_url}" -o "${infra_version_file}"
echo ""

echo "[INFO] Fetching installer code ..."
curl "${installer_code_url}" -o "${installer_code_file}"
echo ""

echo "[INFO] Fetching Ubuntu initializing script ..."
curl "${image_initialize_url}" -o "${image_initialize_file}"
echo ""

echo "[INFO] Running Ubuntu initializing script ..."
/bin/bash "${image_initialize_file}" 0123456789abcdef selfhosting
echo ""

echo "Finished!"
echo "[WARNING] You have to reboot your server before taking it into use!"
echo ""