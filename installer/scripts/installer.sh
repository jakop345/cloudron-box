#!/bin/bash

exec > >(tee "/var/log/cloudron/installer-$$-$BASHPID.log")
exec 2>&1

set -e
set -x

HOME_DIR="/home/yellowtent"
SRCDIR="$HOME_DIR/box"
CONFIG_DIR="$HOME_DIR/config"
DATA_DIR="$HOME_DIR/data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd )"

echo "Provisioning box with code: $PROVISION_REVISION and data: $PROVISION_RESTORE_URL"

# supervisorctl stop all

if [ -n "$PROVISION_RESTORE_URL" ]; then
    echo "Downloading backup: $PROVISION_RESTORE_URL"
    rm -rf "$DATA_DIR/*" # DATA_DIR itself cannot be removed because it is mounted
    curl -L "$PROVISION_RESTORE_URL" | tar -zxf - -C "$DATA_DIR"
fi

cd "$SRCDIR"
while true; do
    timeout 3m git fetch origin && break
    echo "git fetch timedout, trying again"
    sleep 2
done

git reset --hard "$PROVISION_REVISION"

# For the update case, remove any existing config
rm -rf "$CONFIG_DIR/*"

$SRCDIR/src/scripts/postinstall.sh

