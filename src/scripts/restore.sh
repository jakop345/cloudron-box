#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 0
fi

NOW=$(date +%Y%m%dT%H%M%S)
LOG="/var/log/cloudron/restore-${NOW}.log"
exec 2>&1 1> "$LOG"

if [ $# -lt 1 ]; then
    echo "restore.sh <restore_url>"
    exit 1
fi

RESTORE_URL="$1"
SRCDIR="$HOME/box"

echo "Arguments: $@"

# Stop the box
echo "Stopping box"
supervisorctl stop box

echo "Downloading backup: $RESTORE_URL"
curl -X GET -o /tmp/restore.tar.gz "$RESTORE_URL"

rm -rf "$HOME/data"

# FIXME userid should be constants across restores
tar zxvf /tmp/restore.tar.gz -C "$HOME/data"

# only upgrades are supported
echo "Migrating data"
PATH=$PATH:$SRCDIR/node_modules/.bin npm run-script migrate_data

sudo -u yellowtent -H bash <<EOF
# TODO: do not auto-start stopped containers (httpPort might need fixing to start them)
sqlite3 $HOME/data/cloudron.sqlite 'UPDATE apps SET installationState = "pending_restore", healthy = NULL, runState = NULL, containerId = NULL, httpPort = NULL, installationProgress = NULL'
EOF

echo "Restart nginx"
supervisorctl restart nginx

echo "Starting box"
supervisorctl start box

echo "Restore over"

