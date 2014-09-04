#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 2
fi

if [[ "$#" != "2" ]]; then
    echo "Usage: update.sh <version> <revision/tag/branch>"
    exit 1
fi

VERSION="$1"
REVISION="$2"

cyan='\e[0;36m'
green='\e[0;32m'
red='\e[0;31m'
clear='\e[0m'
bold='\e[0;1m'

function info() {
    echo -e "${bold}[II] $1${clear}"
}

function error() {
    echo -e "${red}[EE] $1${clear}"
}

function check() {
    if [[ $? != 0 ]]; then
        error "Failed!"
        exit 1
    fi

    info $1
}

echo ""
echo "============================="
echo "       Cloudron Update       "
echo "============================="
echo ""

BASEDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." && pwd )"
JSON="$BASEDIR/node_modules/.bin/json"

exec > >(tee /var/log/cloudron/update.log)
exec 2>&1

info "Perform update in $BASEDIR"
cd $BASEDIR;

info "Fetch latest code..."
git fetch
check "Done"

info "Reset repo to latest code..."
git reset --hard $REVISION
check "Done"

info "Updating npm modules"
npm install --production
check "Done"

# FIXME: should instead run above commands as user but I cannot figure
# how to get log redirection to work
chown -R yellowtent:yellowtent $BASEDIR

info "Stop the box code..."
OUT=`supervisorctl stop box`
RESULT=`echo $OUT | grep ERROR`
if [[ $RESULT != "" ]]; then
    error "Failed to stop box"
    error "$OUT"
    exit 1;
fi
info "Done"

info "Run release update script..."
UPDATE_FILE="$BASEDIR/src/scripts/update/${VERSION}.sh"
info "Release update script is $UPDATE_FILE"
if [ -x "$UPDATE_FILE" ]; then
    /bin/bash $UPDATE_FILE 2>&1
    if [[ $? != 0 ]]; then
        info "Failed to run $UPDATE_FILE"
    else
        info "Successfully ran $UPDATE_FILE"
    fi
else
    info "No update script to run"
fi

info "Updating box version to $VERSION"
JSON -I -f /home/yellowtent/.yellowtent/cloudron.conf -c "this.version = \"$VERSION\""

info "Start the box code..."
OUT=`supervisorctl start box`
RESULT=`echo $OUT | grep ERROR`
if [[ $RESULT != "" ]]; then
    error "Failed to start box"
    error "$OUT"
    exit 1;
fi
info "Done"

info "Restart nginx..."
OUT=`supervisorctl restart nginx`
RESULT=`echo $OUT | grep ERROR`
if [[ $RESULT != "" ]]; then
    error "Failed to restart nginx"
    error "$OUT"
    exit 1;
fi
info "Done"

echo ""
echo "Update successful."
echo ""
