#!/bin/bash

BASEDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [[ "$#" != "1" ]]; then
    echo "Missing cloudron IP argument";
    exit 1;
fi

ssh root@$1 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i $BASEDIR/ssh/id_rsa_yellowtent
