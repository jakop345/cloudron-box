#!/bin/bash

set -eu -o pipefail

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

readonly DATA="${HOME}/data"
readonly DATA_TEST="${HOME}/.cloudron_test/data"

if [[ -d "${DATA}" ]]; then
    btrfs subvolume create "${DATA}/$1"
    mkdir -p "${DATA}/$1/data"
    chown -R yellowtent:yellowtent "${DATA}/$1"
fi

if [[ -d "${DATA_TEST}" ]]; then
    mkdir -p "${DATA_TEST}/$1/data"
    chown -R ${SUDO_USER}:${SUDO_USER} "${DATA_TEST}/$1"
fi

