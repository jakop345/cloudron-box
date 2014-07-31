#!/bin/sh

set -e

echo "Box bootstrapping"

BASEDIR=/home/yellowtent/box
USER=yellowtent

# we get the appstore origin from the caller which is baked into the image
APPSTORE_ORIGIN=$1

echo "==== Setup /etc/yellowtent ===="
mkdir -p  /etc/yellowtent


echo "==== Provision box with credentials ===="
cat > /etc/yellowtent.json <<EOF
{
    "appstoreOrigin": "$APPSTORE_ORIGIN"
}
EOF

echo "==== Setup ssl certs ===="
CERTIFICATE_DIR=/etc/yellowtent/cert
mkdir -p $CERTIFICATE_DIR
cd $CERTIFICATE_DIR
./$BASEDIR/scripts/generate_certificate.sh
curl -o cert.tar $APPSTORE_ORIGIN/api/v1/boxes/certificateUS California San Francisco Selfhost Cloudron `hostname -f` cert@selfhost.io cert.tar
# curl -o cert.tar $APPSTORE_ORIGIN/api/v1/boxes/certificate?token=<%= token %>
tar xf cert.tar


echo "==== Sudoers file for app removal ===="
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!$BASEDIR/src/rmappdir.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $BASEDIR/src/rmappdir.sh

Defaults!$BASEDIR/src/reloadnginx.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $BASEDIR/src/reloadnginx.sh
EOF


echo "==== Setup yellowtent ===="
cd $BASEDIR
npm install --production


echo "==== Setup nginx ===="
cd $BASEDIR
killall nginx || echo "nginx not running"   # condition makes killall not fatal to set -e
mkdir -p /home/$USER/.yellowtent/applications
ln -sf /home/$USER/.yellowtent/applications $BASEDIR/nginx/applications
touch /home/$USER/.yellowtent/naked_domain.conf
ln -sf /home/$USER/.yellowtent/naked_domain.conf $BASEDIR/nginx/naked_domain.conf
FQDN=`hostname -f`
sed -e "s/##ADMIN_FQDN##/admin-$FQDN/" nginx/admin.conf_template > nginx/applications/admin.conf
# TODO until I find a way to have a more dynamic nginx config
# this will break if we ever do an update
cp nginx/certificates.conf_deployed nginx/certificates.conf
chown $USER:$USER -R /home/$USER/.yellowtent/


echo "==== Setup supervisord ===="
supervisorctl shutdown || echo "supervisord not running"
mv /etc/supervisor/ /etc/supervisor_save || echo "/etc/supervisor already moved"
ln -sf $BASEDIR/supervisor /etc/supervisor
echo "export NGINX_ROOT=$BASEDIR" >> /etc/default/supervisor
sed -i -e "s/autostart=false/autostart=true/" /etc/supervisor/conf.d/box.conf
/etc/init.d/supervisor start
