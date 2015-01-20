#!/bin/bash

echo "Starting box code"
service supervisor start

sleep 2 # give supervisor sometime to start the processes

nginx -s reload

