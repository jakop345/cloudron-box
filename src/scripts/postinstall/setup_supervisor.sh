#!/bin/bash

set -e

USER=yellowtent
SRCDIR=/home/$USER/box
DATA_DIR=/home/$USER/data
NGINX_CONFIG_DIR=/home/$USER/configs/nginx

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

rm -rf /etc/supervisor
mkdir -p /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp $SRCDIR/supervisor/supervisord.conf /etc/supervisor/

echo "Writing nginx supervisor config..."
cat > /etc/supervisor/conf.d/nginx.conf <<EOF
[program:nginx]
command=/usr/sbin/nginx -c "$NGINX_CONFIG_DIR/nginx.conf" -p /var/log/nginx/
autostart=true
autorestart=true
redirect_stderr=true
EOF
echo "Done"

echo "Writing box supervisor config..."
cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:box]
command=/usr/bin/node app.js
autostart=true
autorestart=true
redirect_stderr=true
directory=$SRCDIR
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="box*"
EOF

echo "Writing updater supervisor config..."
cat > /etc/supervisor/conf.d/updater.conf <<EOF
[program:updater]
command=/usr/bin/node server.js update-mode
autostart=true
autorestart=true
redirect_stderr=true
directory=$SRCDIR/installer
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="installer*,connect-lastmile"
EOF

# http://www.onurguzel.com/supervisord-restarting-and-reloading/
echo "Restarting supervisor"
/etc/init.d/supervisor stop
while test -e "/var/run/supervisord.pid" && kill -0 `cat /var/run/supervisord.pid`; do
    echo "Waiting for supervisord to stop"
    sleep 1
done
/etc/init.d/supervisor start

