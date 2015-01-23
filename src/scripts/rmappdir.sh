#!/bin/bash

set -eu

if [[ ${EUID} -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [[ $# -eq 0 ]]; then
    echo "No arguments supplied"
    exit 1
fi

if [[ "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

readonly APPDATA="${HOME}/data/appdata"
readonly APPDATA_TEST="${HOME}/.yellowtenttest/data/appdata"

rm -rf "${APPDATA}/$1"
rm -rf "${APPDATA_TEST}/$1"
