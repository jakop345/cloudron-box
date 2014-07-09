#!/bin/bash

set -v

USER_HOME=/home/yellowtent
BASEDIR=$USER_HOME/box
USER=yellowtent

echo "==== Create User $USER ===="
id $USER
if [[ $? -ne 0 ]]; then
    rm -rf /home/$USER
    useradd $USER -m
fi
usermod $USER -a -G docker

# now exit on failure
set -e

echo "== Yellowtent base image preparation =="

export DEBIAN_FRONTEND=noninteractive

echo "==== Install project dependencies ===="
apt-get update


echo "==== Setup nodejs ===="
apt-get -y install nodejs npm
ln -sf /usr/bin/nodejs /usr/bin/node


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


echo "== Box bootstrapping =="


echo "==== Cloning box repo ===="
if [ -d "$BASEDIR/.git" ]; then
    echo "Updating the box repo"
    cd $BASEDIR
    git fetch
    git reset --hard origin/master
else
    echo "Cloning the box repo"
    rm -rf $BASEDIR
    mkdir -p $USER_HOME
    cd $USER_HOME
    git clone http://bootstrap:not4long@yellowtent.girish.in/yellowtent/box.git
    cd box
    git checkout origin/master
fi
npm install --production


echo "==== Sudoers file for app removal ===="
cat > /etc/sudoers.d/yellowtent <<EOF
Defaults!$BASEDIR/src/rmappdir.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $BASEDIR/src/rmappdir.sh

Defaults!$BASEDIR/src/reloadnginx.sh env_keep=HOME
$USER ALL=(root) NOPASSWD: $BASEDIR/src/reloadnginx.sh
EOF


echo "==== Make the user own his home ===="
chown $USER:$USER -R /home/$USER


echo "==== Install init script ===="
cat > /etc/init.d/bootstrap <<EOF
#!/bin/sh

OUT="/tmp/bootstrap"
STDOUT="$OUT.log"

ANNOUNCE="curl -fv https://appstore-dev.herokuapp.com/api/v1/boxes/announce?name=`hostname -f` &>> $STDOUT"
#ANNOUNCE="curl -fv https://nebulon.fwd.wf/api/v1/boxes/announce?name=`hostname -f` &>> $STDOUT"

eval $ANNOUNCE
RET=$?
while [[ $RET -ne 0 ]]; do
        echo "[EE] Failed to announce itself with error code $RET, try again in a second" >> $OUT
        sleep 1
        eval $ANNOUNCE
        RET=$?
done

echo "[II] Successfully announced itself to appstore" >> $OUT
EOF
chmod +x /etc/init.d/bootstrap
update-rc.d bootstrap defaults
