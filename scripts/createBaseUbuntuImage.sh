#!/bin/bash

SCRIPT_DIR=$(dirname $0)

if [[ $# -ne 1 ]]; then
    echo "Missing droplet IP from which a base image should be produced."
    exit 1;
fi

echo "Creating base image using droplet with IP $1";

cd $SCRIPT_DIR/..

scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ../appstore/ssh/id_rsa_yellowtent ./scripts/initializeBaseUbuntuImage.sh root@$1:.

ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ../appstore/ssh/id_rsa_yellowtent root@$1 "/bin/bash /root/initializeBaseUbuntuImage.sh"
