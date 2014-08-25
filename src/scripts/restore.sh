#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 0
fi

# http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html

NOW=$(date +%Y%m%dT%H%M%S)
LOG=/var/log/cloudron/restore-${NOW}.log
exec 2>&1 1> $LOG

if [ $# -ne 6 ]; then
    echo "No arguments supplied"
    exit 1
fi

S3_KEY=$1
S3_SECRET=$2
S3_PREFIX=$3
S3_BUCKET=$4
FILE=$5
TOKEN=$6

# Stop the box
echo "Stopping box"
supervisorctl stop box

DATE_HEADER=$(date "+%a, %d %b %Y %T %z") # Tue, 27 Mar 2007 19:36:42 +0000

RESOURCE="/${S3_BUCKET}/${S3_PREFIX}/${FILE}"
CONTENT_TYPE="application/x-compressed-tar"
STRING_TO_SIGN="GET\n\n\n${DATE_HEADER}\n${RESOURCE}"
SIGNATURE=`echo -en ${STRING_TO_SIGN} | openssl sha1 -hmac ${S3_SECRET} -binary | base64`

echo "Downloading backup: $RESOURCE"
curl -X GET \
    -H "Host: ${S3_BUCKET}.s3.amazonaws.com" \
    -H "Date: ${DATE_HEADER}" \
    -H "Authorization: AWS ${S3_KEY}:${SIGNATURE}" \
    -o /tmp/restore.tar.gz \
    https://${S3_BUCKET}.s3.amazonaws.com/${S3_PREFIX}/${FILE}

rm -rf $HOME/.yellowtent/*
tar zxvf /tmp/restore.tar.gz -C $HOME/.yellowtent

# replace the token
cat $HOME/.yellowtent/cloudron.conf
$HOME/box/node_modules/.bin/json -I -f $HOME/.yellowtent/cloudron.conf -e "this.token=\"$TOKEN\""
chown yellowtent:yellowtent $HOME/.yellowtent/cloudron.conf
cat $HOME/.yellowtent/cloudron.conf

echo "Starting box"
supervisorctl start box

echo "Restore over"

