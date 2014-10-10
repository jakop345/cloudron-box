#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 0
fi

set -e

NOW=$(date +%Y-%m-%dT%H:%M:%S)
LOG=/var/log/cloudron/backup-${NOW}.log
exec 2>&1 1> $LOG

if [ $# -lt 1 ]; then
    echo "Usage: backup.sh url [restart_box_code_flag]"
    exit 1
fi

BACKUP_URL="$1"

# Stop the box
echo "Stopping box"
supervisorctl stop box

CONTAINER_IDS=$(docker ps -q)

# Stop all containers
echo "Stopping all running containers"
docker stop $CONTAINER_IDS

DATE_HEADER=$(date "+%a, %d %b %Y %T %z") # Tue, 27 Mar 2007 19:36:42 +0000
FILE="backup_${NOW}.tar.gz"

cd $HOME && tar czf /tmp/$FILE box .yellowtent
echo "Uploading backup to $BACKUP_URL"
curl -X PUT -T "/tmp/${FILE}" \
    -H "Date: ${DATE_HEADER}" \
    -H "Content-Type: application/x-compressed-tar" \
    "$BACKUP_URL"

rm "/tmp/${FILE}"

echo "Starting all containers"
MAIL_SERVER="172.17.120.120"
arp -d $MAIL_SERVER || echo "ARP does not have mail server entry"
docker start $CONTAINER_IDS

# skip restarting the box code if a 2nd argument is provided, this is for the update case
if [[ ! $2 ]]; then
    echo "Starting box"
    supervisorctl start box
fi

echo "Backup over"

