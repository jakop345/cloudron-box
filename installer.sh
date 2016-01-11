#!/bin/bash

set -eu -o pipefail

echo ""
echo "======== Cloudron Installer ========"
echo ""

if [ $# -lt 4 ]; then
    echo "Usage: ./installer.sh <fqdn> <aws key id> <aws key secret> <bucket> <provider> <revision>"
    exit 1
fi

# commandline arguments
readonly fqdn="${1}"
readonly aws_access_key_id="${2}"
readonly aws_access_key_secret="${3}"
readonly aws_backup_bucket="${4}"
readonly provider="${5}"
readonly revision="${6}"

# environment specific urls
readonly api_server_origin="https://api.dev.cloudron.io"
readonly web_server_origin="https://dev.cloudron.io"
readonly release_bucket_url="https://s3.amazonaws.com/dev-cloudron-releases"
readonly versions_url="https://s3.amazonaws.com/dev-cloudron-releases/versions.json"
readonly installer_code_url="${release_bucket_url}/box-${revision}.tar.gz"

# runtime consts
readonly installer_code_file="/tmp/box.tar.gz"
readonly installer_tmp_dir="/tmp/box"
readonly cert_folder="/tmp/certificates"

# check for fqdn in /ets/hosts
echo "[INFO] checking for hostname entry"
readonly hostentry_found=$(grep "${fqdn}" /etc/hosts || true)
if [[ -z $hostentry_found ]]; then
    echo "[WARNING] No entry for ${fqdn} found in /etc/hosts"
    echo "Adding an entry ..."

    cat >> /etc/hosts <<EOF

# The following line was added by the Cloudron installer script
127.0.1.1 ${fqdn} ${fqdn}
EOF
else
    echo "Valid hostname entry found in /etc/hosts"
fi
echo ""

echo "[INFO] ensure minimal dependencies ..."
apt-get update
apt-get install -y curl
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

echo "[INFO] Fetching installer code ..."
curl "${installer_code_url}" -o "${installer_code_file}"
echo ""

echo "[INFO] Extracting installer code to ${installer_tmp_dir} ..."
rm -rf "${installer_tmp_dir}" && mkdir -p "${installer_tmp_dir}"
tar xvf "${installer_code_file}" -C "${installer_tmp_dir}"
echo ""

echo "Creating initial provisioning config ..."
cat > /root/provision.json <<EOF
{
    "sourceTarballUrl": "",
    "data": {
        "apiServerOrigin": "${api_server_origin}",
        "webServerOrigin": "${web_server_origin}",
        "fqdn": "${fqdn}",
        "token": "",
        "isCustomDomain": true,
        "boxVersionsUrl": "${versions_url}",
        "version": "",
        "tlsCert": "${tls_cert}",
        "tlsKey": "${tls_key}",
        "provider": "${provider}",
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
            "secretAccessKey": "${aws_access_key_secret}"
        },
        "tlsConfig": {
            "provider": "letsencrypt-dev"
        }
    }
}
EOF

echo "[INFO] Running Ubuntu initializing script ..."
/bin/bash "${installer_tmp_dir}/installer/images/initializeBaseUbuntuImage.sh" "${revision}" selfhosting
echo ""

echo "[INFO] Reloading systemd daemon ..."
systemctl daemon-reload
echo ""

echo "[INFO] Restart docker ..."
systemctl restart docker
echo ""

echo "[FINISHED] Now starting Cloudron init jobs ..."
systemctl start box-setup

# TODO this is only for convenience we should probably just let the user do a restart
sleep 5 && sync
systemctl start cloudron-installer
journalctl -u cloudron-installer.service -f
