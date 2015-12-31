#!/bin/bash

set -eu -o pipefail

echo ""
echo "======== Cloudron Installer ========"
echo ""

if [ $# -lt 5 ]; then
    echo "Usage: ./installer.sh <fqdn> <aws key id> <aws key secret> <bucket> <region>"
    exit 1
fi

readonly fqdn="${1}"
readonly aws_access_key_id="${2}"
readonly aws_access_key_secret="${3}"
readonly aws_backup_bucket="${4}"
readonly aws_region="${5}"

readonly installer_code_url="https://s3.amazonaws.com/cloudron-selfhosting/installer.tar"
readonly installer_code_file="/root/installer.tar"
readonly INSTALLER_TMP_DIR="/tmp/installer"

readonly latest_box_url="https://s3.amazonaws.com/cloudron-selfhosting"
readonly latest_version_url="https://s3.amazonaws.com/cloudron-selfhosting/latest.version"

readonly box_code_file="${HOME}/cloudron.tar.gz"

readonly cert_folder="/tmp/certificates"

echo "[INFO] ensure minimal dependencies ..."
apt-get update
apt-get install -y curl
echo ""

echo "[INFO] Cleanup old files ..."
rm -rf "${installer_code_file}"
rm -rf "${box_code_file}"

echo "[INFO] Fetching installer code ..."
curl "${installer_code_url}" -o "${installer_code_file}"
echo ""

echo "[INFO] Generating certificates ..."
rm -rf "${cert_folder}"
mkdir -p "${cert_folder}"

cat > "${cert_folder}/CONFIG" <<EOF
[ req ]
default_bits           = 1024
default_keyfile        = keyfile.pem
distinguished_name     = req_distinguished_name
prompt                 = no
req_extensions         = v3_req

[ req_distinguished_name ]
C                      = DE
ST                     = Berlin
L                      = Berlin
O                      = Cloudron UG
OU                     = Cloudron
CN                     = ${fqdn}
emailAddress           = cert@cloudron.io

[ v3_req ]
# Extensions to add to a certificate request
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${fqdn}
DNS.2 = *.${fqdn}
EOF

# generate cert files
openssl genrsa 2048 > "${cert_folder}/host.key"
openssl req -new -out "${cert_folder}/host.csr" -key "${cert_folder}/host.key" -config "${cert_folder}/CONFIG"
openssl x509 -req -days 3650 -in "${cert_folder}/host.csr" -signkey "${cert_folder}/host.key" -out "${cert_folder}/host.cert" -extensions v3_req -extfile "${cert_folder}/CONFIG"

# make them json compatible, by collapsing to one line
tls_cert=$(sed ':a;N;$!ba;s/\n/\\n/g' "${cert_folder}/host.cert")
tls_key=$(sed ':a;N;$!ba;s/\n/\\n/g' "${cert_folder}/host.key")
echo ""

echo "[INFO] Retrieving latest version ..."
readonly version=$(curl "${latest_version_url}")
echo "Using version ${version}"
echo ""

echo "[INFO] Fetching latest code ..."
curl "${latest_box_url}/${version}.tar.gz" -o "${box_code_file}"
echo ""

echo "[INFO] Extracting installer code ..."
rm -rf "${INSTALLER_TMP_DIR}" && mkdir -p "${INSTALLER_TMP_DIR}"
tar xvf /root/installer.tar -C "${INSTALLER_TMP_DIR}"
echo ""

echo "[INFO] Running Ubuntu initializing script ..."
/bin/bash "${INSTALLER_TMP_DIR}/images/initializeBaseUbuntuImage.sh" 0123456789abcdef selfhosting
echo ""

echo "Creating initial provisioning config ..."
cat > /root/provision.json <<EOF
{
    "sourceTarballUrl": "${latest_box_url}/${version}.tar.gz",
    "data": {
        "apiServerOrigin": "https://api.dev.cloudron.io",
        "webServerOrigin": "https://dev.cloudron.io",
        "fqdn": "${fqdn}",
        "token": "",
        "isCustomDomain": true,
        "boxVersionsUrl": "https://s3.amazonaws.com/dev-cloudron-releases/versions.json",
        "version": "${version}",
        "tlsCert": "${tls_cert}",
        "tlsKey": "${tls_key}",
        "provider": "",
        "backupConfig": {
            "provider": "s3",
            "accessKeyId": "${aws_access_key_id}",
            "secretAccessKey": "${aws_access_key_secret}",
            "bucket": "${aws_backup_bucket}",
            "prefix": "backups"
        },
        "dnsConfig": {
            "provider": "route53",
            "accessKeyId": "${aws_access_key_id}",
            "secretAccessKey": "${aws_access_key_secret}",
            "region": "${aws_region}"
        },
        "tlsConfig": {
            "provider": "letsencrypt-dev"
        }
    }
}
EOF

echo "[INFO] Reloading systemd daemon ..."
systemctl daemon-reload
echo ""

echo "[INFO] Restart docker ..."
systemctl restart docker
echo ""

echo "[FINISHED] Now starting Cloudron init jobs ..."
systemctl start box-setup
# give the fs some time to do the volumes
sleep 5 && sync
systemctl start cloudron-installer
journalctl -u cloudron-installer.service -f
