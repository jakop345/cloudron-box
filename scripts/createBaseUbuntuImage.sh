#!/bin/bash

BASEDIR=$(dirname $0)

if [[ $# -ne 1 ]]; then
    echo "Missing droplet IP from which a base image should be produced."
    exit 1;
fi

echo "Creating base image using droplet with IP $1";

cd $BASEDIR/..

scp -i ../appstore/ssh/id_rsa_yellowtent ./scripts/initializeBaseUbuntuImage.sh root@$1:.

ssh -i ../appstore/ssh/id_rsa_yellowtent root@$1 "/bin/bash /root/initializeBaseUbuntuImage.sh"