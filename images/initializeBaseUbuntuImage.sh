#!/bin/bash

set -euv -o pipefail

readonly USER=yellowtent
readonly USER_HOME="/home/${USER}"
readonly INSTALLER_SOURCE_DIR="${USER_HOME}/installer"
readonly INSTALLER_REVISION="$1"
readonly USER_DATA_FILE="/root/user_data.img"
readonly USER_DATA_DIR="/home/yellowtent/data"

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SOURCE_DIR}/INFRA_VERSION"

echo "==== Create User ${USER} ===="
if ! id "${USER}"; then
    useradd "${USER}" -m
fi

echo "=== Yellowtent base image preparation (installer revision - ${INSTALLER_REVISION}) ==="

export DEBIAN_FRONTEND=noninteractive

echo "=== Upgrade ==="
apt-get update
apt-get upgrade -y

# Setup firewall before everything. Atleast docker 1.5 creates it's own chain and the -X below will remove it
# Do NOT use iptables-persistent because it's startup ordering conflicts with docker
echo "=== Setting up firewall ==="
# clear tables and set default policy
iptables -F # flush all chains
iptables -X # delete all chains
# default policy for filter table
iptables -P INPUT DROP
iptables -P FORWARD ACCEPT # TODO: disable icc and make this as reject
iptables -P OUTPUT ACCEPT

# NOTE: keep these in sync with src/apps.js validatePortBindings
# allow ssh, http, https, ping, dns
iptables -I INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp -m tcp -m multiport --dports 80,443,886 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A INPUT -s 172.17.0.0/16 -j ACCEPT # required to accept any connections from apps to our IP:<public port>

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

echo "==== Install btrfs tools"
apt-get -y install btrfs-tools

echo "==== Install docker ===="
# see http://idolstarastronomer.com/painless-docker.html
echo deb https://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9
apt-get update
apt-get -y install lxc-docker-1.7.0
ln -sf /usr/bin/docker.io /usr/local/bin/docker

echo "=== Remove existing aufs mounts ==="
systemctl stop docker
if aufs_mounts=$(grep 'aufs' /proc/mounts | awk '{ print $2 }' | sort -r); then
    umount -l "${aufs_mounts}"
fi
rm -rf /var/lib/docker

echo "=== Setup btrfs for preloading docker images ==="
fallocate -l "8192m" "${USER_DATA_FILE}" # 8gb start
mkfs.btrfs -L UserHome "${USER_DATA_FILE}"
echo "${USER_DATA_FILE} ${USER_DATA_DIR} btrfs loop,nosuid 0 0" >> /etc/fstab
mkdir -p "${USER_DATA_DIR}" && mount "${USER_DATA_FILE}"
mkdir -p "${USER_DATA_DIR}/docker"
sed -e "s,ExecStart=.*,ExecStart=/usr/bin/docker -d -H fd:// -s btrfs -g ${USER_DATA_DIR}/docker," -i /lib/systemd/system/docker.service
systemctl enable docker

# give docker sometime to start up and create iptables rules
systemctl start docker
sleep 10

# Disable forwarding to metadata route from containers
iptables -I FORWARD -d 169.254.169.254 -j DROP

# ubuntu will restore iptables from this file automatically. this is here so that docker's chain is saved to this file
mkdir /etc/iptables && iptables-save > /etc/iptables/rules.v4

echo "=== Enable memory accounting =="
sed -e 's/GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX="cgroup_enable=memory swapaccount=1"/' -i /etc/default/grub
update-grub

# now add the user to the docker group
usermod "${USER}" -a -G docker
echo "=== Pulling base docker images ==="
docker pull "${BASE_IMAGE}"

echo "=== Pulling mysql addon image ==="
docker pull "${MYSQL_IMAGE}"

echo "=== Pulling postgresql addon image ==="
docker pull "${POSTGRESQL_IMAGE}"

echo "=== Pulling redis addon image ==="
docker pull "${REDIS_IMAGE}"

echo "=== Pulling mongodb addon image ==="
docker pull "${MONGODB_IMAGE}"

echo "=== Pulling graphite docker images ==="
docker pull "${GRAPHITE_IMAGE}"

echo "=== Pulling mail relay ==="
docker pull "${MAIL_IMAGE}"

echo "==== Install nginx ===="
apt-get -y install nginx-full

echo "==== Install build-essential ===="
apt-get -y install build-essential rcconf


echo "==== Install mysql ===="
debconf-set-selections <<< 'mysql-server mysql-server/root_password password password'
debconf-set-selections <<< 'mysql-server mysql-server/root_password_again password password'
apt-get -y install mysql-server

echo "==== Install pwgen ===="
apt-get -y install pwgen

echo "==== Install collectd ==="
apt-get install -y collectd collectd-utils
update-rc.d -f collectd remove

echo "=== Install tmpreaper ==="
apt-get install -y tmpreaper
sed -e 's/SHOWWARNING=true/# SHOWWARNING=true/' -i /etc/tmpreaper.conf

echo "==== Extracting installer source ===="
rm -rf "${INSTALLER_SOURCE_DIR}" && mkdir -p "${INSTALLER_SOURCE_DIR}"
tar xvf /root/installer.tar -C "${INSTALLER_SOURCE_DIR}" && rm /root/installer.tar
echo "${INSTALLER_REVISION}" > "${INSTALLER_SOURCE_DIR}/REVISION"

echo "==== Install nodejs ===="
apt-get install -y curl
curl -sL https://deb.nodesource.com/setup_0.12 | bash -
apt-get install -y nodejs

echo "=== Rebuilding npm packages ==="
cd "${INSTALLER_SOURCE_DIR}" && npm install --production
chown "${USER}:${USER}" -R "${INSTALLER_SOURCE_DIR}"

echo "==== Install installer systemd script ===="
cat > /etc/systemd/system/cloudron-installer.service <<EOF
[Unit]
Description=Cloudron Installer

[Service]
Type=idle
ExecStart="${INSTALLER_SOURCE_DIR}/src/server.js"
Environment="DEBUG=installer*,connect-lastmile"
KillMode=process
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
systemctl enable cloudron-installer

# Restore iptables before docker
echo "==== Install iptables-restore systemd script ===="
cat > /etc/systemd/system/iptables-restore.service <<EOF
[Unit]
Description=IPTables Restore
Before=docker.service

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable iptables-restore

# Allocate swap files
# https://bbs.archlinux.org/viewtopic.php?id=194792 ensures this runs after do-resize.service
echo "==== Install box-setup systemd script ===="
cat > /etc/systemd/system/box-setup.service <<EOF
[Unit]
Description=Box Setup
Before=docker.service
After=do-resize.service

[Service]
Type=oneshot
ExecStart="${INSTALLER_SOURCE_DIR}/systemd/box-setup.sh"
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl enable box-setup

# Configure systemd
sed -e "s/^#SystemMaxUse=/SystemMaxUse=100M/" -i /etc/systemd/journald.conf

sync
