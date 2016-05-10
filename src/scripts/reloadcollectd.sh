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

if [[ "${BOX_ENV}" == "cloudron" ]]; then
    for i in {1..10}; do
        if systemctl is-active collectd.service; then
            systemctl restart collectd
            exit 0
        fi

        echo "Collectd is not active. Maybe some other apptask is restarting it"
        sleep 6
    done

    echo "collectd not running"
    exit 1
fi

