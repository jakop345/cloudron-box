#!/bin/bash

# This script is called once at the end of a cloudrons lifetime

set -eu -o pipefail

readonly BOX_SRC_DIR=/home/yellowtent/box

arg_data=""

args=$(getopt -o "" -l "data:" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --data) arg_data="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

echo "Setting up splash screen"
"${BOX_SRC_DIR}/setup/splashpage.sh" --retire --data "${arg_data}" # show splash
"${BOX_SRC_DIR}/setup/stop.sh" # stop the cloudron code
