#!/bin/bash

set -e

readonly BOX_SRCDIR=/home/yellowtent/box
readonly DATA_DIR=/home/yellowtent/data

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp "${SCRIPT_DIR}/supervisord/supervisord.conf" /etc/supervisor/

echo "Writing supervisor configs..."

cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:box]
command=/usr/bin/node "${BOX_SRCDIR}/app.js"
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/box.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",USER="yellowtent",DEBUG="box*,connect-lastmile",NODE_ENV="cloudron"
EOF

cat > /etc/supervisor/conf.d/proxy.conf <<EOF
[program:proxy]
command=/usr/bin/node "${BOX_SRCDIR}/proxy.js"
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/proxy.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",USER="yellowtent",DEBUG="box*",NODE_ENV="cloudron"
EOF

cat > /etc/supervisor/conf.d/apphealthtask.conf <<EOF
[program:apphealthtask]
command=/usr/bin/node "${BOX_SRCDIR}/apphealthtask.js"
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/apphealthtask.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",USER="yellowtent",DEBUG="box*",NODE_ENV="cloudron"
EOF

