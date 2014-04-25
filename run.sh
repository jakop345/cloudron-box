#!/bin/sh

echo
echo "Starting YellowTent server at port 443..."
echo

#### When using it as a future start suite
# if [[ `whoami` == root ]]; then
#     echo "Do not run the script as root!"
#     echo "This script spawns nginx with sudo as well as unprivileged servers."
#     echo
#     exit 1;
# fi

cd nginx
sudo nginx -c yellowtent.conf -p $PWD
cd ..
