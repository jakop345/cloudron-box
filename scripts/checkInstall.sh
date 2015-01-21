#!/bin/bash

set -e

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# checks if all scripts are sudo access
scripts=("${SOURCE_DIR}/src/scripts/rmappdir.sh" \
         "${SOURCE_DIR}/src/scripts/reloadnginx.sh" \
         "${SOURCE_DIR}/src/scripts/backup.sh" \
         "${SOURCE_DIR}/src/scripts/reboot.sh" \
         "${SOURCE_DIR}/src/scripts/reloadcollectd.sh")

for script in "${scripts[@]}"; do
    output=$(sudo -n "${script}" --check 2>/dev/null)
    if [[ "${output}" != "OK" ]]; then
        echo "${script} does not have sudo access"
        exit 1
    fi
done

if ! docker inspect girish/test:0.6 >/dev/null 2>/dev/null; then
    echo "docker pull girish/test:0.6 for tests to run"
    exit 1
fi

if ! docker inspect girish/redis:0.1 >/dev/null 2>/dev/null; then
    echo "docker pull girish/redis:0.1 for tests to run"
    exit 1
fi

exit 0
