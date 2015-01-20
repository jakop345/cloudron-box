#!/bin/bash

set -e

# looks like restarting supervisor completely is the only way to reload it
reload_supervisor() {
    service supervisor stop || true

    echo -n "Waiting for supervisord to stop"
    while test -e "/var/run/supervisord.pid" && kill -0 `cat /var/run/supervisord.pid`; do
        echo -n "."
        sleep 1
    done
    echo ""

    echo "Starting supervisor"

    service supervisor start

    sleep 2 # give supervisor sometime to start the processes
}

reload_supervisor

nginx -s reload

