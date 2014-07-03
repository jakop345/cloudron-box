#!/bin/sh

set -e

echo "== Yellowtent base image preparation =="

export DEBIAN_FRONTEND=noninteractive

echo "==== Install project dependencies ===="
apt-get update


echo "==== Setup nodejs ===="
apt-get -y install nodejs npm
ln -s /usr/bin/nodejs /usr/bin/node


echo "==== Setup git ===="
apt-get -y install git


echo "==== Setup docker ===="
# see http://idolstarastronomer.com/painless-docker.html
echo deb https://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9
apt-get update
apt-get -y install lxc-docker
ln -sf /usr/bin/docker.io /usr/local/bin/docker


echo "==== Setup nginx ===="
apt-get -y install nginx-full
service nginx stop


echo "==== Setup build-essential ===="
apt-get -y install build-essential


echo "==== Setup sqlite3 ===="
apt-get -y install sqlite3


echo "==== Setup supervisor ===="
apt-get -y install supervisor


echo "==== Create User $USER ===="
id $USER
if [[ $? -ne 0 ]]; then
    useradd $USER -m
fi
usermod $USER -a -G docker



echo "== Box bootstrapping =="

BASEDIR=/home/yellowtent/box
USER=yellowtent


echo "==== Cloning box repo ===="
mkdir -p $BASEDIR
cd $BASEDIR
cd ..
git clone http://bootstrap:not4long@yellowtent.girish.in/yellowtent/box.git
cd box
npm install --production


echo "==== Sudoers file for app removal ===="
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!$BASEDIR/src/rmappdir.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $BASEDIR/src/rmappdir.sh

Defaults!$BASEDIR/src/reloadnginx.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $BASEDIR/src/reloadnginx.sh
EOF


echo "==== Setup nginx ===="
killall nginx
mkdir -p /home/$USER/.yellowtent/applications
ln -s /home/$USER/.yellowtent/applications $BASEDIR/nginx/applications
touch /home/$USER/.yellowtent/naked_domain.conf
ln -sf /home/$USER/.yellowtent/naked_domain.conf $BASEDIR/nginx/naked_domain.conf
# TODO until I find a way to have a more dynamic nginx config
# this will break if we ever do an update
cp nginx/certificates.conf_deployed nginx/certificates.conf


echo "==== Make the user own his home ===="
chown $USER:$USER -R /home/$USER/.yellowtent/


echo "==== Install init script ===="
cat > /etc/init.d/bootstrap <<EOF
#!/bin/sh

curl -v https://appstore-dev.herokuapp.com/api/v1/boxes/announce >> /tmp/yellowtent

echo "box announced itself to appstore" >> /tmp/yellowtent
EOF