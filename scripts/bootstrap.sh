#!/bin/sh

set -e

echo "Box bootstrapping"

USER=yellowtent
SRCDIR=/home/$USER/box
BACKUP_DIR=/home/$USER/.yellowtent

# we get the appstore origin from the caller which is baked into the image
APP_SERVER_URL=$1

echo "==== Setup /etc/yellowtent ===="
mkdir -p  /etc/yellowtent


echo "==== Setup ssl certs ===="
CERTIFICATE_DIR=/etc/yellowtent/cert
mkdir -p $CERTIFICATE_DIR
cd $CERTIFICATE_DIR
/bin/bash $SRCDIR/scripts/generate_certificate.sh US California 'San Francisco' Selfhost Cloudron `hostname -f` cert@selfhost.io .
tar xf cert.tar


echo "==== Sudoers file for app removal ===="
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!$SRCDIR/src/rmappdir.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/rmappdir.sh

Defaults!$SRCDIR/src/reloadnginx.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $SRCDIR/src/reloadnginx.sh
EOF


echo "==== Setup yellowtent ===="
sudo -u $USER bash <<EOF
cd $SRCDIR
npm install --production
EOF


echo "==== Setup nginx ===="
cd $SRCDIR
killall nginx || echo "nginx not running"   # condition makes killall not fatal to set -e
mkdir -p $BACKUP_DIR/nginx/applications
cp nginx/nginx.conf $BACKUP_DIR/nginx/nginx.conf
cp nginx/mime.types $BACKUP_DIR/nginx/mime.types
touch $BACKUP_DIR/nginx/naked_domain.conf
FQDN=`hostname -f`
sed -e "s/##ADMIN_FQDN##/admin-$FQDN/" -e "s|##SRCDIR##|$SRCDIR|" nginx/admin.conf_template > $BACKUP_DIR/nginx/applications/admin.conf
cp nginx/certificates.conf_deployed $BACKUP_DIR/nginx/certificates.conf
chown $USER:$USER -R $BACKUP_DIR


echo "==== Setup supervisord ===="
supervisorctl shutdown || echo "supervisord not running"
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
