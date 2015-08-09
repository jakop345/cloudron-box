#!/bin/bash

set -eu -o pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root." >&2
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi

if [ $# -lt 1 ]; then
    echo "Usage: collectlogs.sh <program>"
    exit 1
fi

readonly program_name=$1

echo "${program_name}.log"
echo "-------------------"
tail --lines=100 /var/log/supervisor/${program_name}.log
echo
echo
echo "dmesg"
echo "-----"
dmesg | tail --lines=100
echo
echo
echo "docker"
echo "------"
tail --lines=100 /var/log/upstart/docker.log
echo
echo



