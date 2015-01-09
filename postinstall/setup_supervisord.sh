#!/bin/bash

set -e

USER=yellowtent
BOX_SRCDIR=/home/$USER/box
INSTALLER_SRCDIR=/home/$USER/installer
DATA_DIR=/home/$USER/data
NGINX_CONFIG_DIR=/home/$USER/configs/nginx

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

rm -rf /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp $SCRIPT_DIR/supervisord/supervisord.conf /etc/supervisor/

echo "Writing supervisor configs..."

cat > /etc/supervisor/conf.d/nginx.conf <<EOF
[program:nginx]
command=/usr/sbin/nginx -c "$NGINX_CONFIG_DIR/nginx.conf" -p /var/log/nginx/
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/nginx.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
EOF

cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:box]
command=/usr/bin/node $BOX_SRCDIR/app.js
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/box.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="box*,connect-lastmile"
EOF

# FIXME: Run installer in a separate supervisor instead and let it never die
cat > /etc/supervisor/conf.d/updater.conf <<EOF
[program:updater]
command=/usr/bin/node $INSTALLER_SRCDIR/installer/server.js update-mode
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/updater.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
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

