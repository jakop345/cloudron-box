#!/bin/bash

set -e

DOMAIN_NAME=`hostname -f`
HARAKA_DIR="/home/yellowtent/.yellowtent/haraka"

docker run -d --name="haraka" \
    -p 127.0.0.1:25:25 \
    -h $DOMAIN_NAME \
    -e DOMAIN_NAME=$DOMAIN_NAME \
    -v $HARAKA_DIR:/app/data girish/haraka:0.1

