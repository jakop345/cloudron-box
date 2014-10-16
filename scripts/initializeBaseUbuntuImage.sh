#!/bin/bash

set -v

USER_HOME=/home/yellowtent
APPDATA=$USER_HOME/.yellowtent/appdata
SRCDIR=$USER_HOME/box
USER=yellowtent
APPSTORE_URL=$1
BOX_REVISION=$2

echo "==== Create User $USER ===="
id $USER
if [[ $? -ne 0 ]]; then
    rm -rf /home/$USER
    useradd $USER -m
fi

# now exit on failure
set -e

echo "== Yellowtent base image preparation ($APPSTORE_URL, $BOX_REVISION) =="

export DEBIAN_FRONTEND=noninteractive

echo "=== Setup swap file ==="
fallocate -l 2048m /2048MiB.swap
chmod 600 /2048MiB.swap
mkswap /2048MiB.swap
swapon /2048MiB.swap
echo "/2048MiB.swap  none  swap  sw  0 0" >> /etc/fstab

echo "==== Install project dependencies ===="
apt-get update

echo "=== Upgrade ==="
apt-get upgrade -y

echo "==== Install nodejs ===="
apt-get -y install nodejs npm
ln -sf /usr/bin/nodejs /usr/bin/node


echo "==== Install git ===="
apt-get -y install git


echo "==== Install docker ===="
# see http://idolstarastronomer.com/painless-docker.html
echo deb https://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9
apt-get update
apt-get -y install lxc-docker
ln -sf /usr/bin/docker.io /usr/local/bin/docker

service docker stop
AUFS_MOUNTS=$(grep 'aufs' /proc/mounts | awk '{print$2}' | sort -r)
if [ ! -z $AUFS_MOUNTS ]; then
    umount -l $AUFS_MOUNTS
fi
rm -rf /var/lib/docker
mkdir /var/lib/docker

# create a separate 12GB fs for docker images
# dd if=/dev/zero of=/root/docker_data.img bs=1M count=12000
truncate -s 12G /root/docker_data.img
mkfs.ext4 -F /root/docker_data.img
tune2fs -c0 -i0 /root/docker_data.img # disable automatic fs check
echo "/root/docker_data.img /var/lib/docker ext4 loop,nosuid 0 0" >> /etc/fstab
mount -a

service docker start
# give docker a couple of seconds to start up
sleep 2

# now add the user to the docker group
usermod $USER -a -G docker
echo "=== Pulling base docker images ==="
docker pull girish/base:0.6
docker pull girish/base:0.7

echo "=== Pulling graphite docker images ==="
docker pull girish/graphite:0.2

echo "=== Pulling haraka mail relay ==="
docker pull girish/haraka:0.1

# https://jpetazzo.github.io/2014/06/23/docker-ssh-considered-evil/
echo "=== Install nsenter ==="
docker run --rm jpetazzo/nsenter cat /nsenter > /usr/bin/nsenter
chmod +x /usr/bin/nsenter

echo "==== Install nginx ===="
apt-get -y install nginx-full
service nginx stop
update-rc.d -f nginx remove

echo "==== Install build-essential ===="
apt-get -y install build-essential rcconf


echo "==== Install sqlite3 ===="
apt-get -y install sqlite3


echo "==== Install supervisor ===="
apt-get -y install supervisor
service supervisor stop
update-rc.d -f supervisor remove


echo "==== Install collectd ==="
apt-get install -y collectd collectd-utils
update-rc.d -f collectd remove


echo "== Box bootstrapping =="

echo "==== Cloning box repo ===="
echo "Cloning the box repo"
mkdir -p $USER_HOME
cd $USER_HOME
git clone http://bootstrap:not4long@yellowtent.girish.in/yellowtent/box.git
cd $SRCDIR
git reset --hard $BOX_REVISION
echo "git HEAD is `git rev-parse HEAD`"

NPM_INSTALL="npm install --production --loglevel verbose"
rm -rf ./node_modules
eval $NPM_INSTALL
RET=$?
while [[ $RET -ne 0 ]]; do
    echo "[EE] npm install failed, try again"
    rm -rf ./node_modules
    eval $NPM_INSTALL
    RET=$?
done


echo "==== Seting up appdata ==="
# create a separate 12GB fs for appdata
# dd if=/dev/zero of=/root/appdata.img bs=1M count=12000
truncate -s 12G /root/appdata.img
mkfs.ext4 -F /root/appdata.img
tune2fs -c0 -i0 /root/appdata.img # disable automatic fs check
mkdir -p $APPDATA
echo "/root/appdata.img $APPDATA ext4 loop,nosuid 0 0" >> /etc/fstab
mount -a

echo "==== Make the user own his home ===="
chown $USER:$USER -R /home/$USER


echo "=== Setting up firewall ==="
# clear tables and set default policy
apt-get install -y iptables-persistent
iptables -F
# default policy for filter table
iptables -P INPUT DROP
iptables -P FORWARD ACCEPT # TODO: disable icc and make this as reject
iptables -P OUTPUT ACCEPT

# NOTE: keep these in sync with src/apps.js validatePortBindings
# allow ssh, http, https, ping, dns
iptables -I INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp -m tcp -m multiport --dports 80,443 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT

# loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# prevent DoS
# iptables -A INPUT -p tcp --dport 80 -m limit --limit 25/minute --limit-burst 100 -j ACCEPT

# log dropped incoming. keep this at the end of all the rules
iptables -N LOGGING # new chain
iptables -A INPUT -j LOGGING # last rule in INPUT chain
iptables -A LOGGING -m limit --limit 2/min -j LOG --log-prefix "IPTables Packet Dropped: " --log-level 7
iptables -A LOGGING -j DROP

# ubuntu will restore iptables from this file automatically
iptables-save > /etc/iptables/rules.v4


echo "==== Install init script ===="
cat > /etc/init.d/bootstrap <<EOF
#!/bin/bash

do_start() {
    mkdir -p /var/log/cloudron

    exec 2>&1 1> "/var/log/cloudron/bootstrap_init-\$\$-\$BASHPID.log"

    echo "Updating to git revision $BOX_REVISION"
    cd $SRCDIR
    sudo -u $USER bash -c "git fetch && git reset --hard $BOX_REVISION"

    echo "Running bootstrap script with args $APPSTORE_URL $BOX_REVISION"
    /bin/bash $SRCDIR/scripts/bootstrap.sh $APPSTORE_URL $BOX_REVISION

    echo "Disabling bootstrap init script"
    update-rc.d bootstrap remove
}

case "\$1" in
    start)
        do_start
        ;;
    restart|reload|force-reload)
        echo "Error: argument '\$1' not supported" >&2
        exit 3
        ;;
    stop)
        ;;
    *)
        echo "Usage: \$0 start|stop" >&2
        exit 3
        ;;
esac

echo "End of bootstrap init script"
EOF

chmod +x /etc/init.d/bootstrap
update-rc.d bootstrap defaults 99

sync

