#!/bin/bash

set -eu -o pipefail

CRT="/tmp/test.crt";
KEY="/tmp/test.key";
CSR="/tmp/test.csr";

openssl genrsa 2048 > $KEY
openssl req -new -key $KEY -out $CSR -subj "/C=DE/ST=Berlin/L=Berlin/O=Cloudron/OU=Dev/CN=test.cloudron.io"
openssl x509 -req -days 365 -in $CSR -signkey $KEY -out $CRT
