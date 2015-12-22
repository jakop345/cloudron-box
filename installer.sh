#!/bin/bash

set -eu -o pipefail

echo ""
echo "======== Cloudron Installer ========"
echo ""

if [ $# -lt 1 ]; then
    echo "Usage: ./installer.sh <fqdn>"
    exit 1
fi

readonly fqdn="${1}"

readonly installer_code_url="https://s3.amazonaws.com/cloudron-selfhosting/installer.tar"
readonly installer_code_file="${HOME}/installer.tar"

readonly image_initialize_url="https://s3.amazonaws.com/cloudron-selfhosting/initializeBaseUbuntuImage.sh"
readonly image_initialize_file="${HOME}/initializeBaseUbuntuImage.sh"

readonly latest_box_url="https://s3.amazonaws.com/cloudron-selfhosting"
readonly latest_version_url="https://s3.amazonaws.com/cloudron-selfhosting/latest.version"

readonly box_code_file="${HOME}/cloudron.tar.gz"

readonly certificate_folder="/tmp/certificates"

echo "[INFO] ensure minimal dependencies ..."
apt-get update
apt-get install -y curl
echo ""

echo "[INFO] Cleanup old files ..."
rm -rf "${installer_code_file}"
rm -rf "${image_initialize_file}"
rm -rf "${box_code_file}"

echo "[INFO] Fetching installer code ..."
curl "${installer_code_url}" -o "${installer_code_file}"
echo ""

echo "[INFO] Fetching Ubuntu initializing script ..."
curl "${image_initialize_url}" -o "${image_initialize_file}"
echo ""

echo "[INFO] Generating certificates ..."
/bin/bash generate_certificate.sh "US" "California" "San Francisco" "Cloudron Company" "Cloudron" "${fqdn}" "cert@cloudron.io" "${certificate_folder}"
tls_cert=$(sed ':a;N;$!ba;s/\n/\\n/g' "${certificate_folder}/host.cert")
tls_key=$(sed ':a;N;$!ba;s/\n/\\n/g' "${certificate_folder}/host.key")
echo ""

echo "[INFO] Retrieving latest version ..."
readonly version=$(curl "${latest_version_url}")
echo "Using version ${version}"
echo ""

echo "[INFO] Fetching latest code ..."
curl "${latest_box_url}/${version}.tar.gz" -o "${box_code_file}"
echo ""

echo "[INFO] Running Ubuntu initializing script ..."
/bin/bash "${image_initialize_file}" 0123456789abcdef selfhosting
echo ""

echo "Creating initial provisioning config ..."
cat > /root/provision.json <<EOF
{
    "sourceTarballUrl": "${latest_box_url}/${version}.tar.gz",
    "data": {
        "apiServerOrigin": "https://api.dev.cloudron.io",
        "webServerOrigin": "https://dev.cloudron.io",
        "fqdn": "${fqdn}",
        "token": null,
        "isCustomDomain": true,
        "boxVersionsUrl": "https://s3.amazonaws.com/dev-cloudron-releases/versions.json",
        "version": "${version}",
        "tlsCert": "${tls_cert}",
        "tlsKey": "${tls_key}"
    }
}
EOF

echo "[INFO] Reloading systemd daemon ..."
systemctl daemon-reload
echo ""

echo "[FINISHED] Now starting Cloudron init jobs ..."
systemctl start cloudron-installer.service
journalctl -u cloudron-installer.service -f
