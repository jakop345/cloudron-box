#!/bin/bash

set -euv -o pipefail

readonly USER=yellowtent
readonly USER_HOME="/home/${USER}"
readonly INSTALLER_SOURCE_DIR="${USER_HOME}/installer"
readonly INSTALLER_REVISION="${1:-master}"
readonly PROVIDER="${2:-generic}"
readonly USER_DATA_FILE="/root/user_data.img"
readonly USER_DATA_DIR="/home/yellowtent/data"

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

function die {
    echo $1
    exit 1
}

[[ "$(systemd --version 2>&1)" == *"systemd 229"* ]] || die "Expecting systemd to be 229"

echo "==== Create User ${USER} ===="
if ! id "${USER}"; then
    useradd "${USER}" -m
fi

export DEBIAN_FRONTEND=noninteractive

echo "=== Upgrade ==="
apt-get update -y
apt-get dist-upgrade -y
apt-get install -y curl

# Setup firewall before everything. docker creates it's own chain and the -X below will remove it
# Do NOT use iptables-persistent because it's startup ordering conflicts with docker
echo "=== Setting up firewall ==="
# clear tables and set default policy
iptables -F # flush all chains
iptables -X # delete all chains
# default policy for filter table
iptables -P INPUT ACCEPT # accept by default to allow network drives to persist
iptables -P FORWARD ACCEPT # TODO: disable icc and make this as reject
iptables -P OUTPUT ACCEPT

# NOTE: keep these in sync with src/apps.js validatePortBindings
# allow ssh, http, https, ping, dns
iptables -I INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
# caas has ssh on port 202
if [[ "${PROVIDER}" == "caas" ]]; then
    iptables -A INPUT -p tcp -m tcp -m multiport --dports 25,80,202,443,587,993,4190 -j ACCEPT
else
    iptables -A INPUT -p tcp -m tcp -m multiport --dports 25,80,22,443,587,993,4190 -j ACCEPT
fi
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A INPUT -s 172.18.0.0/16 -j ACCEPT # required to accept any connections from apps to our IP:<public port>

# loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# prevent DoS
# iptables -A INPUT -p tcp --dport 80 -m limit --limit 25/minute --limit-burst 100 -j ACCEPT

# log dropped incoming. keep this at the end of all the rules
iptables -N LOGGING # new chain
iptables -A INPUT -j LOGGING # last rule in INPUT chain (log and drop)
iptables -A LOGGING -m limit --limit 2/min -j LOG --log-prefix "IPTables Packet Dropped: " --log-level 7
iptables -A LOGGING -j DROP

echo "==== Install btrfs tools ==="
apt-get -y install btrfs-tools

echo "==== Install docker ===="
# install docker from binary to pin it to a specific version. the current debian repo does not allow pinning
# IMPORTANT: docker 1.11.x breaks the --dns option hack that we use below
curl https://get.docker.com/builds/Linux/x86_64/docker-1.10.2 > /usr/bin/docker
apt-get -y install aufs-tools
chmod +x /usr/bin/docker
groupadd docker
cat > /etc/systemd/system/docker.socket <<EOF
[Unit]
Description=Docker Socket for the API
PartOf=docker.service

[Socket]
ListenStream=/var/run/docker.sock
SocketMode=0660
SocketUser=root
SocketGroup=docker

[Install]
WantedBy=sockets.target
EOF
cat > /etc/systemd/system/docker.service <<EOF
[Unit]
Description=Docker Application Container Engine
After=network.target docker.socket
Requires=docker.socket

[Service]
ExecStart=/usr/bin/docker daemon -H fd:// --log-driver=journald --exec-opt native.cgroupdriver=cgroupfs --dns 127.0.0.1
MountFlags=slave
LimitNOFILE=1048576
LimitNPROC=1048576
LimitCORE=infinity

[Install]
WantedBy=multi-user.target
EOF

echo "=== Setup btrfs data ==="
if ! grep -q loop.ko /lib/modules/`uname -r`/modules.builtin; then
    # on scaleway loop is not built-in
    echo "loop" >> /etc/modules
    modprobe loop
fi
truncate -s "8192m" "${USER_DATA_FILE}" # 8gb start (this will get resized dynamically by cloudron-system-setup.service)
mkfs.btrfs -L UserHome "${USER_DATA_FILE}"
mkdir -p "${USER_DATA_DIR}"
mount -t btrfs -o loop,nosuid "${USER_DATA_FILE}" ${USER_DATA_DIR}

systemctl daemon-reload
systemctl enable docker
systemctl start docker

# give docker sometime to start up and create iptables rules
# those rules come in after docker has started, and we want to wait for them to be sure iptables-save has all of them
sleep 10

# Disable forwarding to metadata route from containers
iptables -I FORWARD -d 169.254.169.254 -j DROP

# ubuntu will restore iptables from this file automatically. this is here so that docker's chain is saved to this file
mkdir /etc/iptables && iptables-save > /etc/iptables/rules.v4

echo "=== Enable memory accounting =="
if [[ "${PROVIDER}" == "digitalocean" ]] || [[ "${PROVIDER}" == "caas" ]]; then
    sed -e 's/GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX="console=tty1 root=LABEL=DOROOT notsc clocksource=kvm-clock net.ifnames=0 cgroup_enable=memory swapaccount=1 panic_on_oops=1 panic=5"/' -i /etc/default/grub
    update-grub
elif [[ "${PROVIDER}" == "ec2" ]] || [[ "${PROVIDER}" == "generic" ]]; then
    sed -e 's/GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX="cgroup_enable=memory swapaccount=1 panic_on_oops=1 panic=5"/' -i /etc/default/grub
    update-grub
fi

# now add the user to the docker group
usermod "${USER}" -a -G docker

echo "==== Install nodejs ===="
# Cannot use anything above 4.1.1 - https://github.com/nodejs/node/issues/3803
mkdir -p /usr/local/node-4.1.1
curl -sL https://nodejs.org/dist/v4.1.1/node-v4.1.1-linux-x64.tar.gz | tar zxvf - --strip-components=1 -C /usr/local/node-4.1.1
ln -s /usr/local/node-4.1.1/bin/node /usr/bin/node
ln -s /usr/local/node-4.1.1/bin/npm /usr/bin/npm
apt-get install -y python   # Install python which is required for npm rebuild
[[ "$(python --version 2>&1)" == "Python 2.7."* ]] || die "Expecting python version to be 2.7.x"

echo "==== Downloading docker images ===="
if [ -f ${SOURCE_DIR}/infra_version.js ]; then
    images=$(node -e "var i = require('${SOURCE_DIR}/infra_version.js'); console.log(i.baseImages.join(' '), Object.keys(i.images).map(function (x) { return i.images[x].tag; }).join(' '));")

    echo "Pulling images: ${images}"
    for image in ${images}; do
        docker pull "${image}"
    done
else
    echo "No infra_versions.js found, skipping image download"
fi

echo "==== Install nginx ===="
apt-get -y install nginx-full
[[ "$(nginx -v 2>&1)" == *"nginx/1.10."* ]] || die "Expecting nginx version to be 1.10.x"

echo "==== Install build-essential ===="
apt-get -y install build-essential rcconf

echo "==== Install mysql ===="
debconf-set-selections <<< 'mysql-server mysql-server/root_password password password'
debconf-set-selections <<< 'mysql-server mysql-server/root_password_again password password'
apt-get -y install mysql-server-5.7
[[ "$(mysqld --version 2>&1)" == *"5.7."* ]] || die "Expecting mysql version to be 5.7.x"

echo "==== Install pwgen and swaks awscli ===="
apt-get -y install pwgen swaks awscli

echo "==== Install collectd ==="
if ! apt-get install -y collectd collectd-utils; then
    # FQDNLookup is true in default debian config. The box code has a custom collectd.conf that fixes this
    echo "Failed to install collectd. Presumably because of http://mailman.verplant.org/pipermail/collectd/2015-March/006491.html"
    sed -e 's/^FQDNLookup true/FQDNLookup false/' -i /etc/collectd/collectd.conf
fi
update-rc.d -f collectd remove

# this simply makes it explicit that we run logrotate via cron. it's already part of base ubuntu
echo "==== Install logrotate ==="
apt-get install -y cron logrotate
systemctl enable cron

echo "=== Prepare installer revision - ${INSTALLER_REVISION}) ==="
rm -rf /tmp/box && mkdir -p /tmp/box
curl "https://git.cloudron.io/cloudron/box/repository/archive.tar.gz?ref=${INSTALLER_REVISION}" | tar zxvf - --strip-components=1 -C /tmp/box
mkdir -p "${INSTALLER_SOURCE_DIR}"
cp -rf /tmp/box/installer/* "${INSTALLER_SOURCE_DIR}" && rm -rf /tmp/box
chown "${USER}:${USER}" -R "${INSTALLER_SOURCE_DIR}"
echo "${INSTALLER_REVISION}" > "${INSTALLER_SOURCE_DIR}/REVISION"

echo "==== Install cloudron-version tool ===="
npm install -g cloudron-version@0.1.1

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

# Allocate swap files
# https://bbs.archlinux.org/viewtopic.php?id=194792 ensures this runs after do-resize.service
# On ubuntu ec2 we use cloud-init https://wiki.archlinux.org/index.php/Cloud-init
echo "==== Install cloudron-system-setup systemd script ===="
cat > /etc/systemd/system/cloudron-system-setup.service <<EOF
[Unit]
Description=Box Setup
Before=docker.service collectd.service mysql.service sshd.service nginx.service
After=cloud-init.service

[Service]
Type=oneshot
ExecStart="${INSTALLER_SOURCE_DIR}/systemd/cloudron-system-setup.sh"
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable iptables-restore
systemctl enable cloudron-system-setup

# Configure systemd
sed -e "s/^#SystemMaxUse=.*$/SystemMaxUse=100M/" \
    -e "s/^#ForwardToSyslog=.*$/ForwardToSyslog=no/" \
    -i /etc/systemd/journald.conf

# When rotating logs, systemd kills journald too soon sometimes
# See https://github.com/systemd/systemd/issues/1353 (this is upstream default)
sed -e "s/^WatchdogSec=.*$/WatchdogSec=3min/" \
    -i /lib/systemd/system/systemd-journald.service

sync

# Configure time
sed -e 's/^#NTP=/NTP=0.ubuntu.pool.ntp.org 1.ubuntu.pool.ntp.org 2.ubuntu.pool.ntp.org 3.ubuntu.pool.ntp.org/' -i /etc/systemd/timesyncd.conf
timedatectl set-ntp 1
timedatectl set-timezone UTC

# Give user access to system logs
apt-get -y install acl
usermod -a -G systemd-journal ${USER}
mkdir -p /var/log/journal  # in some images, this directory is not created making system log to /run/systemd instead
chown root:systemd-journal /var/log/journal
systemctl restart systemd-journald
setfacl -n -m u:${USER}:r /var/log/journal/*/system.journal

echo "==== Install ssh ==="
apt-get -y install openssh-server
# https://stackoverflow.com/questions/4348166/using-with-sed on why ? must be escaped
sed -e 's/^#\?PermitRootLogin .*/PermitRootLogin without-password/g' \
    -e 's/^#\?PermitEmptyPasswords .*/PermitEmptyPasswords no/g' \
    -e 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/g' \
    -i /etc/ssh/sshd_config

# caas has ssh on port 202
if [[ "${PROVIDER}" == "caas" ]]; then
    sed -e 's/^#\?Port .*/Port 202/g' -i /etc/ssh/sshd_config
fi

# DO uses Google nameservers by default. This causes RBL queries to fail (host 2.0.0.127.zen.spamhaus.org)
# We do not use dnsmasq because it is not a recursive resolver and defaults to the value in the interfaces file (which is Google DNS!)
echo "==== Install unbound DNS ==="
apt-get -y install unbound

# required so we can connect to this machine since port 22 is blocked by iptables by now
systemctl reload sshd

