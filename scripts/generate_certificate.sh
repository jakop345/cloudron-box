#!/bin/bash

# C                      = US
# ST                     = California
# L                      = San Francisco
# O                      = CloudronInc
# OU                     = Cloudron
# CN                     = *.nebulon.cloudron.com
# emailAddress           = cert@cloudron.io

if [[ $# < 7 ]]; then
    echo "Not enough arguments";
    exit 1;
fi

ARG_C=$1;
ARG_ST=$2;
ARG_L=$3;
ARG_O=$4;
ARG_OU=$5;
ARG_CN=$6;
ARG_EMAIL=$7;

CONFIG_FILE=cert.config;
OUT_TAR=cert.tar;

CERT_OUT_DIR=/tmp/$ARG_CN;

if [[ -z "$8" ]]; then
    echo "No output dir specified, use default $CERT_OUT_DIR";
else
    echo "Using output dir $8";
    CERT_OUT_DIR=$8;
fi

echo "";
echo "===================================";
echo " Generating certifcate:";
echo "   C:     $ARG_C";
echo "   ST:    $ARG_ST";
echo "   L:     $ARG_L";
echo "   O:     $ARG_O";
echo "   OU:    $ARG_OU";
echo "   CN:    $ARG_CN";
echo "   EMAIL: $ARG_EMAIL";
echo "===================================";
echo "";

# ensure out dir
mkdir -p $CERT_OUT_DIR;

# cd into out dir
cd $CERT_OUT_DIR;

# clean out dir
rm host.*;
rm $CONFIG_FILE;

# generate config file
cat > $CONFIG_FILE <<EOF
[ req ]
default_bits           = 1024
default_keyfile        = keyfile.pem
distinguished_name     = req_distinguished_name
prompt                 = no
req_extensions         = v3_req

[ req_distinguished_name ]
C                      = $ARG_C
ST                     = $ARG_ST
L                      = $ARG_L
O                      = $ARG_O
OU                     = $ARG_OU
CN                     = $ARG_CN
emailAddress           = $ARG_EMAIL

[ v3_req ]
# Extensions to add to a certificate request
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $ARG_CN
DNS.2 = *.$ARG_CN
EOF

# generate cert files
openssl genrsa 2048 > host.key;

openssl req -new -out host.csr -key host.key -config $CONFIG_FILE
openssl x509 -req -days 3650 -in host.csr -signkey host.key -out host.cert -extensions v3_req -extfile $CONFIG_FILE
openssl x509 -noout -fingerprint -text < host.cert > host.info;
cat host.cert host.key > host.pem;

# create the cert.tar
tar -cf $OUT_TAR host.cert host.info host.key host.pem

echo "Done.";
