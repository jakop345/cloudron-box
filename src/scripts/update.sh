#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 0
fi

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

exec > >(tee /var/log/cloudron/update.log)
exec 2>&1

info "Perform update in $BASEDIR"
cd $BASEDIR;

info "Fetch latest code..."
git fetch
check "Done"

info "Reset repo to latest code..."
git reset --hard origin/master
check "Done"

info "Run release update script..."
cd $BASEDIR/src/scripts/update
UPDATE_FILE=`ls -1 -v -B *.sh | tail -n 1`
info "Release update script is $UPDATE_FILE"
/bin/bash $UPDATE_FILE 2>&1
if [[ $? != 0 ]]; then
    echo "Failed to run $UPDATE_FILE"
else
    echo "Successfully ran $UPDATE_FILE"
fi

info "Restart the box code..."
OUT=`supervisorctl restart box`
RESULT=`echo $OUT | grep ERROR`
if [[ $RESULT != "" ]]; then
    error "Failed to restart box"
    error "$OUT"
    exit 1;
fi
info "Done"

echo ""
echo "Update successful."
echo ""
