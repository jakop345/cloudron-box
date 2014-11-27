#!/bin/bash

set -v

USER=yellowtent
USER_HOME="/home/$USER"
DATA_DIR="$USER_HOME/data"
APPDATA=$DATA_DIR/appdata
SRCDIR=$USER_HOME/box
BOX_REVISION=$1

echo "==== Create User $USER ===="
id $USER
if [[ $? -ne 0 ]]; then
    rm -rf /home/$USER
    useradd $USER -m
fi

# now exit on failure
set -e

echo "== Yellowtent base image preparation ($BOX_REVISION) =="

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
apt-get -y install btrfs-tools
truncate -s 12G /root/docker_data.img
mkfs.btrfs -L DockerData /root/docker_data.img
echo "/root/docker_data.img /var/lib/docker btrfs loop,nosuid 0 0" >> /etc/fstab
echo 'DOCKER_OPTS="-s btrfs"' >> /etc/default/docker
mount -a

service docker start
# give docker a couple of seconds to start up
sleep 2

# now add the user to the docker group
usermod $USER -a -G docker
echo "=== Pulling base docker images ==="
docker pull girish/base:0.9

echo "=== Pulling mysql addon image ==="
docker pull girish/mysql:0.1

echo "=== Pulling graphite docker images ==="
docker pull girish/graphite:0.2

echo "=== Pulling haraka mail relay ==="
docker pull girish/haraka:0.1

echo "==== Install nginx ===="
apt-get -y install nginx-full
service nginx stop
update-rc.d -f nginx remove

echo "==== Install build-essential ===="
apt-get -y install build-essential rcconf


echo "==== Install sqlite3 ===="
apt-get -y install sqlite3

echo "==== Install pwgen ===="
apt-get -y install pwgen

echo "==== Install supervisor ===="
apt-get -y install supervisor
service supervisor stop


echo "==== Install collectd ==="
apt-get install -y collectd collectd-utils
update-rc.d -f collectd remove


echo "== Box bootstrapping =="

echo "==== Seting up data ==="
# create a separate 12GB fs for data
truncate -s 12G /root/user_home.img
mkfs.btrfs -L UserHome /root/user_home.img
echo "/root/user_home.img $USER_HOME btrfs loop,nosuid 0 0" >> /etc/fstab
mount -a
btrfs subvolume create $USER_HOME/data

echo "==== Cloning box repo ===="
echo "Cloning the box repo"
mkdir -p $USER_HOME
cd $USER_HOME
git clone http://bootstrap:not4long@yellowtent.girish.in/yellowtent/box.git
cd $SRCDIR
git reset --hard $BOX_REVISION
echo "git HEAD is `git rev-parse HEAD`"

NPM_INSTALL="npm install --production"
rm -rf ./node_modules
eval $NPM_INSTALL
RET=$?
while [[ $RET -ne 0 ]]; do
    echo "[EE] npm install failed, try again"
    rm -rf ./node_modules
    eval $NPM_INSTALL
    RET=$?
done


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

# disable metadata access to non-root
# modprobe ipt_owner
iptables -A OUTPUT -m owner ! --uid-owner root -d 169.254.169.254 -j DROP

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
cat > /etc/init.d/cloudron-bootstrap <<EOF
#!/bin/bash

checkout_installer() {
    cd "$SRCDIR"
    while true; do
        timeout 3m git fetch origin && break
        echo "git fetch timedout, trying again"
        sleep 2
    done

    git reset --hard "$1"
}

do_start() {
    # this hack lets us work with refs instead of revisions
    checkout_installer "$BOX_REVISION"

    mkdir -p /var/log/cloudron

    exec 2>&1 1> "/var/log/cloudron/bootstrap.log"

    DEBUG="box*,connect-lastmile" $SRCDIR/installer/server.js provision-mode 2>&1 1> /var/log/cloudron/installserver.log &

    echo "Disabling cloudron-bootstrap init script"
    update-rc.d cloudron-bootstrap remove
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

echo "End of cloudron-bootstrap init script"
EOF

chmod +x /etc/init.d/cloudron-bootstrap
update-rc.d cloudron-bootstrap defaults 99

sync

