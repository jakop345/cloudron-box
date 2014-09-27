#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}/.." )" && pwd )"
DOMAIN_NAME=`hostname -f`

HARAKA_DIR="/home/yellowtent/.yellowtent/haraka"
DKIM_DIR="$HARAKA_DIR/dkim/$DOMAIN_NAME"
mkdir -p $DKIM_DIR
openssl genrsa -out $DKIM_DIR/${DOMAIN_NAME}.private 1024
openssl rsa -in $DKIM_DIR/${DOMAIN_NAME}.private -out $DKIM_DIR/{DOMAIN_NAME}.public -pubout -outform PEM

docker run -d --name="haraka" \
    -p 127.0.0.1:25:25
    -v $HARAKA_DIR:/app/data girish/haraka:0.1

chown -R yellowtent.yellowtent $HARAKA_DIR

