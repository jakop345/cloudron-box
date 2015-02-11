#!/bin/bash

set -eux

readonly BOX_SRC_DIR="/home/yellowtent/box"
readonly DATA_DIR="/home/yellowtent/data"

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rm -rf /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp "${script_dir}/supervisord/supervisord.conf" /etc/supervisor/

echo "Writing supervisor configs..."

cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:box]
command=/usr/bin/node "${BOX_SRC_DIR}/app.js"
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/box.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",USER="yellowtent",DEBUG="box*,connect-lastmile",NODE_ENV="cloudron"
EOF

cat > /etc/supervisor/conf.d/oauthproxy.conf <<EOF
[program:oauthproxy]
command=/usr/bin/node "${BOX_SRC_DIR}/oauthproxy.js"
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
command=/usr/bin/node "${BOX_SRC_DIR}/apphealthtask.js"
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/supervisor/apphealthtask.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=2
user=yellowtent
environment=HOME="/home/yellowtent",USER="yellowtent",DEBUG="box*",NODE_ENV="cloudron"
EOF

