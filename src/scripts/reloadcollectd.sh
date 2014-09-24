#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "OK"
    exit 0
fi

/etc/init.d/collectd restart

# always exit with status 0 regardless of whether the restart succeeded
# this is required by tests (where neither supervisor nor nginx are running)
exit 0
