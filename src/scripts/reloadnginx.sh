#!/bin/bash

set -eu -o pipefail

if [[ ${EUID} -ne 0 ]]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

if [[ "${OSTYPE}" == "darwin"* ]]; then
    # On Mac, brew installs supervisor in /usr/local/bin
    export PATH=$PATH:/usr/local/bin
fi

if [[ "${NODE_ENV}" == "cloudron" ]]; then
    nginx -s reload
fi

