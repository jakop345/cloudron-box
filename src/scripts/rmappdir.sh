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
    rm -rf ${DATA}/$1/* ${DATA}/$1/.*
    btrfs subvolume delete "${DATA}/$1"
fi

if [[ -d "${DATA_TEST}" ]]; then
    rm -rf "${DATA_TEST}/$1"
fi
