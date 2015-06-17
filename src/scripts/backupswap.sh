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

BACKUP_SWAP_FILE="/backup.swap"

if [[ "$1" == "--on" ]]; then
    echo "Mounting backup swap"

    if ! swapon -s | grep -q "${BACKUP_SWAP_FILE}"; then
        swapon "${BACKUP_SWAP_FILE}"
    else
        echo "Backup swap already mounted"
    fi
fi

if [[ "$1" == "--off" ]]; then
    echo "Unmounting backup swap"

    if swapon -s | grep -q "${BACKUP_SWAP_FILE}"; then
        swapoff "${BACKUP_SWAP_FILE}"
    else
        echo "Backup swap was not mounted"
    fi
fi

