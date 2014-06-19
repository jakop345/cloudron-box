#!/bin/bash

if [ $EUID -ne 0 ]; then
    echo "This script should be run as root." > /dev/stderr
    exit 1
fi

if [ $# -eq 0 ]; then
    echo "No arguments supplied"
    exit 1
fi

if [ "$1" == "--check" ]; then
    echo "Configured to remove apps from $HOME"
    echo "OK"
    exit 0
fi

APPDATA=$HOME/.yellowtent/appdata

rm -rf "$APPDATA/$1"
