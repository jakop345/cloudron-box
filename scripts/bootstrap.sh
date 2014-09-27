#!/bin/sh
# This script is executed once on startup

exec > >(tee "/var/log/cloudron/bootstrap.log-$$-$BASHPID")

if [ -f "/home/yellowtent/.yellowtent/cloudron.conf" ]; then
    echo "Someone created the cloudron.conf file. How is this possible?"
    exit 1
fi

if [ -d "/home/yellowtent/.yellowtent/graphite" ]; then
    echo "Someone create graphite dir. This is not possible."
    exit 1
fi

exec 2>&1

set -e

echo "Box bootstrapping"

USER=yellowtent
SRCDIR=/home/$USER/box
BACKUP_DIR=/home/$USER/.yellowtent

# we get the appstore origin from the caller which is baked into the image
APP_SERVER_URL=$1
BOX_REVISION=$2

echo "==== Sudoers file for app removal ===="
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!$SRCDIR/src/scripts/rmappdir.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/rmappdir.sh

Defaults!$SRCDIR/src/scripts/reloadnginx.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/reloadnginx.sh

Defaults!$SRCDIR/src/scripts/update.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/update.sh

Defaults!$SRCDIR/src/scripts/backup.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/backup.sh

Defaults!$SRCDIR/src/scripts/restore.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/restore.sh

Defaults!$SRCDIR/src/scripts/reboot.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/reboot.sh

Defaults!$SRCDIR/src/scripts/reloadcollectd.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/scripts/reloadcollectd.sh

EOF


echo "==== Setup yellowtent ===="
sudo -u $USER -H bash <<EOF
cd $SRCDIR
npm install --production
EOF

if [ -d "/home/yellowtent/.yellowtent/graphite" ]; then
    echo "Someone create graphite dir. This is not possible 2."
    exit 1
fi


echo "==== Setup nginx ===="
cd $SRCDIR
mkdir -p $BACKUP_DIR/nginx/applications
cp nginx/nginx.conf $BACKUP_DIR/nginx/nginx.conf
cp nginx/mime.types $BACKUP_DIR/nginx/mime.types
cp nginx/certificates.conf $BACKUP_DIR/nginx/certificates.conf
touch $BACKUP_DIR/nginx/naked_domain.conf
FQDN=`hostname -f`
sed -e "s/##ADMIN_FQDN##/admin-$FQDN/" -e "s|##SRCDIR##|$SRCDIR|" nginx/admin.conf_template > $BACKUP_DIR/nginx/applications/admin.conf

echo "==== Setup ssl certs ===="
CERTIFICATE_DIR=$BACKUP_DIR/nginx/cert
mkdir -p $CERTIFICATE_DIR
cd $CERTIFICATE_DIR
/bin/bash $SRCDIR/scripts/generate_certificate.sh US California 'San Francisco' Selfhost Cloudron `hostname -f` cert@selfhost.io .
tar xf cert.tar

chown $USER:$USER -R $BACKUP_DIR

if [ -d "/home/yellowtent/.yellowtent/graphite" ]; then
    echo "Someone create graphite dir. This is not possible 3."
    exit 1
fi

echo "=== Setup collectd and graphite ==="
$SRCDIR/scripts/bootstrap/setup_collectd.sh

echo "=== Setup haraka mail relay ==="
$SRCDIR/scripts/bootstrap/setup_haraka.sh

echo "==== Setup supervisord ===="
rm -rf /etc/supervisor
mkdir -p /etc/supervisor
mkdir -p /etc/supervisor/conf.d
cp $SRCDIR/supervisor/supervisord.conf /etc/supervisor/

echo "Writing box supervisor config..."
cat > /etc/supervisor/conf.d/nginx.conf <<EOF
[program:nginx]
command=nginx -c $BACKUP_DIR/nginx/nginx.conf -p /var/log/nginx/
autostart=true
autorestart=true
redirect_stderr=true
EOF
echo "Done"

echo "Writing nginx supervisor config..."
cat > /etc/supervisor/conf.d/box.conf <<EOF
[program:box]
command=node app.js
autostart=true
autorestart=true
redirect_stderr=true
directory=$SRCDIR
user=yellowtent
environment=HOME="/home/yellowtent",USER="yellowtent",DEBUG="box*",APP_SERVER_URL=$APP_SERVER_URL
EOF
echo "Done"

update-rc.d supervisor defaults
/etc/init.d/supervisor start
