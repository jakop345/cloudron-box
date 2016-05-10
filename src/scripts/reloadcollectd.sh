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
    # when restoring the cloudron with many apps, the apptasks rush in to restart
    # collectd which makes systemd/collectd very unhappy and puts the collectd in
    # inactive state
    for i in {1..10}; do
        echo "Restarting collectd"
        if systemctl restart collectd; then
            exit 0
        fi
        echo "Failed to reload collectd. Maybe some other apptask is restarting it"
        sleep $((RANDOM%30))
    done
fi

