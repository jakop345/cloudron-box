#!/bin/bash

# This script exists because docker mounted data volumes can have files with arbitrary
# permissions. The box code runs as normal user and thus cannot delete those files. This
# hack can be removed once docker supports user namespaces

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
     mkdir -p "${DATA}/$1/data"
     chown -R yellowtent.yellowtent "${DATA}/$1"
fi

if [[ -d "${DATA_TEST}" ]]; then
    mkdir -p "${DATA_TEST}/$1/data"
    chown -R ${SUDO_USER}.${SUDO_USER} "${DATA_TEST}/$1"
fi

