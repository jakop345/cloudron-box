#!/bin/bash

set -e

USER=yellowtent
BOX_SRCDIR=/home/$USER/box
DATA_DIR=/home/$USER/data

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

rm -rf /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp $SCRIPT_DIR/supervisord/supervisord.conf /etc/supervisor/

echo "Writing supervisor configs..."

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
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="box*,connect-lastmile",NODE_ENV="production"
EOF

cat > /etc/supervisor/conf.d/proxy.conf <<EOF
[program:proxy]
command=/usr/bin/node $BOX_SRCDIR/proxy.js
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/proxy.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="box*",NODE_ENV="production"
EOF

cat > /etc/supervisor/conf.d/apphealthtask.conf <<EOF
[program:apphealthtask]
command=/usr/bin/node $BOX_SRCDIR/src/apphealthtask.js
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/apphealth.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",CLOUDRON="1",USER="yellowtent",DEBUG="box*",NODE_ENV="production"
EOF

