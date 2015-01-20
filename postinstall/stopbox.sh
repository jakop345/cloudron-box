#!/bin/bash

echo "Stopping box code"

service supervisor stop

echo -n "Waiting for supervisord to stop"
while test -e "/var/run/supervisord.pid" && kill -0 `cat /var/run/supervisord.pid`; do
    echo -n "."
    sleep 1
done
echo ""

