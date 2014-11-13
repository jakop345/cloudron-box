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
JSON="$SCRIPT_DIR/../../node_modules/.bin/json"

SAVED_ARGS=("$@")
ARGS=$(getopt -o "" -l "appserverurl:,fqdn:,restoreurl:,version:,tlscert:,tlskey:,token:,boxversionsurl:" -n "$0" -- "$@")
eval set -- "$ARGS"

# if you change this, change the code in postinstall.sh as well
while true; do
    case "$1" in
    --appserverurl) PROVISION_APP_SERVER_URL="$2";;
    --fqdn) PROVISION_FQDN="$2";;
    --restoreurl) PROVISION_RESTORE_URL="$2";;
    --version) PROVISION_VERSION="$2";;
    --tlscert) PROVISION_TLS_CERT="$2";;
    --tlskey) PROVISION_TLS_KEY="$2";;
    --token) PROVISION_TOKEN="$2";;
    --boxversionsurl) PROVISION_BOX_VERSIONS_URL="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

echo "Provisioning box with version: $PROVISION_VERSION and data: $PROVISION_RESTORE_URL"

# for update case, stop nginx and box code
supervisorctl stop all

if [ -n "$PROVISION_RESTORE_URL" ]; then
    echo "Downloading backup: $PROVISION_RESTORE_URL"
    rm -rf "$DATA_DIR/*" # DATA_DIR itself cannot be removed because it is mounted
    curl --retry 5 --retry-delay 5 --max-time 600 -L "$PROVISION_RESTORE_URL" | tar -zxf - -C "$DATA_DIR"
fi

echo "Downloading box versions"
REVISION=$(curl --retry 5 --retry-delay 5 --max-time 600 -L "$PROVISION_BOX_VERSIONS_URL" | $JSON -D, "$PROVISION_VERSION,revision")

cd "$SRCDIR"
while true; do
    timeout 3m git fetch origin && break
    echo "git fetch timedout, trying again"
    sleep 2
done

git reset --hard "$REVISION"

# For the update case, remove any existing config
rm -rf "$CONFIG_DIR/*"

# https://stackoverflow.com/questions/3348443/a-confusion-about-array-versus-array-in-the-context-of-a-bash-comple
# Note that this is the latest postinstall.sh
$SRCDIR/src/scripts/postinstall.sh "${SAVED_ARGS[@]}"

