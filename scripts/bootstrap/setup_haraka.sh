#!/bin/bash

set -e

CLOUDRON_CONF="/home/yellowtent/.yellowtent/cloudron.conf"
DOMAIN_NAME=`hostname -f`
HARAKA_DIR="/home/yellowtent/.yellowtent/haraka"

CONTAINER_ID=$(docker run -d --name="haraka" \
    -p 127.0.0.1:25:25 \
    -h $DOMAIN_NAME \
    -e DOMAIN_NAME=$DOMAIN_NAME \
    -v $HARAKA_DIR:/app/data girish/haraka:0.1)

# Every docker restart results in a new IP. Give our mail server a
# static IP. Alternately, we need to link the mail container with
# all our apps
MAIL_SERVER="172.17.120.120"
HARAKA_PID=$(docker inspect --format="{{ .State.Pid }}" $CONTAINER_ID)
nsenter -t $HARAKA_PID -n ip addr add $MAIL_SERVER/16 dev eth0

cat > /tmp/script.js <<EOF
var fs = require('fs');
var config = fs.existsSync("$CLOUDRON_CONF")
    ? JSON.parse(fs.readFileSync("$CLOUDRON_CONF", 'utf8'))
    : { };
config.mailServer = "$MAIL_SERVER";
config.mailUsername = "admin@$DOMAIN_NAME";
fs.writeFileSync("$CLOUDRON_CONF", JSON.stringify(config));
EOF

sudo -u yellowtent node /tmp/script.js
rm /tmp/script.js

