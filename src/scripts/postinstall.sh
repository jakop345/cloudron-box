#!/bin/bash

exec > >(tee "/var/log/cloudron/postinstall-$$-$BASHPID.log")
exec 2>&1

set -e
set -x

echo "==== Cloudron post installation ===="

USER=yellowtent
SRCDIR=/home/$USER/box
DATA_DIR=/home/$USER/data
HARAKA_DIR="/home/$USER/configs/haraka"
NGINX_CONFIG_DIR=/home/$USER/configs/nginx
NGINX_APPCONFIG_DIR=/home/$USER/configs/nginx/applications
CLOUDRON_CONF="/home/$USER/configs/cloudron.conf"
CLOUDRON_SQLITE="$DATA_DIR/cloudron.sqlite"
DOMAIN_NAME=`hostname -f`

# if you change this, change the code in installer.sh as well
ARGS=$(getopt -o "" -l "appserverurl:,fqdn:,isdev:,restoreurl:,revision:,tlscert:,tlskey:,token:,boxversionsurl:" -n "$0" -- "$@")
eval set -- "$ARGS"

while true; do
    case "$1" in
    --appserverurl) PROVISION_APP_SERVER_URL="$2";;
    --fqdn) PROVISION_FQDN="$2";;
    --isdev) PROVISION_IS_DEV="$2";;
    --restoreurl) PROVISION_RESTORE_URL="$2";;
    --revision) PROVISION_REVISION="$2";;
    --tlscert) PROVISION_TLS_CERT="$2";;
    --tlskey) PROVISION_TLS_KEY="$2";;
    --token) PROVISION_TOKEN="$2";;
    --boxversionsurl) PROVISION_BOX_VERSIONS_URL="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

ADMIN_FQDN="admin-$PROVISION_FQDN"
ADMIN_ORIGIN="https://$ADMIN_FQDN"

# Every docker restart results in a new IP. Give our mail server a
# static IP. Alternately, we need to link the mail container with
# all our apps
# This IP is set by the haraka container on every start and the firewall
# allows connect to port 25
MAIL_SERVER="172.17.120.120"

echo "==== Sudoers file for app removal ===="
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!$SRCDIR/src/scripts/rmappdir.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/rmappdir.sh

Defaults!$SRCDIR/src/scripts/reloadnginx.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/reloadnginx.sh

Defaults!$SRCDIR/src/scripts/backup.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/backup.sh

Defaults!$SRCDIR/src/scripts/reboot.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/reboot.sh

Defaults!$SRCDIR/src/scripts/reloadcollectd.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/reloadcollectd.sh

Defaults!$SRCDIR/installer/scripts/installer.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/installer/scripts/installer.sh

EOF

echo "==== Setup yellowtent ===="
sudo -u $USER -H bash <<EOF
cd $SRCDIR
while true; do
    timeout 3m npm install --production && break
    echo "npm install timedout, trying again"
    sleep 2
done
echo "Migrate data"
PATH=$PATH:$SRCDIR/node_modules/.bin npm run-script migrate_data
EOF

echo "==== Setup nginx ===="
cd $SRCDIR
mkdir -p $NGINX_APPCONFIG_DIR
cp nginx/nginx.conf $NGINX_CONFIG_DIR/nginx.conf
cp nginx/mime.types $NGINX_CONFIG_DIR/mime.types
cp nginx/certificates.conf $NGINX_CONFIG_DIR/certificates.conf
touch $NGINX_CONFIG_DIR/naked_domain.conf
sed -e "s/##ADMIN_FQDN##/$ADMIN_FQDN/" -e "s|##SRCDIR##|$SRCDIR|" nginx/admin.conf_template > $NGINX_APPCONFIG_DIR/admin.conf

echo "==== Setup ssl certs ===="
# The nginx cert dir is excluded from backup in backup.sh
CERTIFICATE_DIR=$NGINX_CONFIG_DIR/cert
mkdir -p $CERTIFICATE_DIR
cd $CERTIFICATE_DIR
echo "$PROVISION_TLS_CERT" > host.cert
echo "$PROVISION_TLS_KEY" > host.key

chown $USER:$USER -R /home/$USER

echo "=== Setup collectd and graphite ==="
$SRCDIR/src/scripts/postinstall/setup_collectd.sh

echo "=== Setup haraka mail relay ==="
docker rm -f haraka || true
HARAKA_CONTAINER_ID=$(docker run -d --name="haraka" --cap-add="NET_ADMIN"\
    -p 127.0.0.1:25:25 \
    -h $DOMAIN_NAME \
    -e DOMAIN_NAME=$DOMAIN_NAME \
    -v $HARAKA_DIR:/app/data girish/haraka:0.1)
echo "Haraka container id: $HARAKA_CONTAINER_ID"

echo "==== Setup supervisord ===="
rm -rf /etc/supervisor
mkdir -p /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp $SRCDIR/supervisor/supervisord.conf /etc/supervisor/

echo "Writing box supervisor config..."
cat > /etc/supervisor/conf.d/nginx.conf <<EOF
[program:nginx]
command=/usr/sbin/nginx -c "$NGINX_CONFIG_DIR/nginx.conf" -p /var/log/nginx/
autostart=true
autorestart=true
redirect_stderr=true
EOF
echo "Done"

echo "Writing nginx supervisor config..."
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

sudo -u yellowtent -H bash <<EOF
echo "Creating cloudron.conf"
cat > "$CLOUDRON_CONF" <<EOF2
{
    "token": "$PROVISION_TOKEN",
    "appServerUrl": "$PROVISION_APP_SERVER_URL",
    "fqdn": "$PROVISION_FQDN",
    "adminOrigin": "$ADMIN_ORIGIN",
    "isDev": "$PROVISION_IS_DEV",
    "boxVersionsUrl": "$PROVISION_BOX_VERSIONS_URL",
    "mailServer": "$MAIL_SERVER",
    "mailUsername": "admin@$DOMAIN_NAME"
}
EOF2

echo "Marking any existing apps for restore"
# TODO: do not auto-start stopped containers (httpPort might need fixing to start them)
sqlite3 "$CLOUDRON_SQLITE" 'UPDATE apps SET installationState = "pending_restore", healthy = NULL, runState = NULL, containerId = NULL, httpPort = NULL, installationProgress = NULL'

# Add webadmin oauth client
echo "Add webadmin oauth cient"
ADMIN_SCOPES="root,profile,users,apps,settings,roleAdmin"
ADMIN_ID=$(cat /proc/sys/kernel/random/uuid)
sqlite3 "$CLOUDRON_SQLITE" 'INSERT OR REPLACE INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) VALUES ("$ADMIN_ID", "webadmin", "cid-webadmin", "unusedsecret", "WebAdmin", "$ADMIN_ORIGIN", "$ADMIN_SCOPES")'
EOF

# http://www.onurguzel.com/supervisord-restarting-and-reloading/
echo "Restarting supervisor"
/etc/init.d/supervisor stop
while test -e "/var/run/supervisord.pid" && kill -0 `cat /var/run/supervisord.pid`; do
    echo "Waiting for supervisord to stop"
    sleep 1
done
/etc/init.d/supervisor start

