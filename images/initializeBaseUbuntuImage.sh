#!/bin/bash

set -euv -o pipefail

readonly USER=yellowtent
readonly USER_HOME="/home/${USER}"
readonly INSTALLER_SOURCE_DIR="${USER_HOME}/installer"
readonly INSTALLER_REVISION="$1"
readonly SELFHOSTED=$(( $# > 1 ? 1 : 0 ))
readonly USER_DATA_FILE="/root/user_data.img"
readonly USER_DATA_DIR="/home/yellowtent/data"

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${SOURCE_DIR}/INFRA_VERSION" ]; then
    source "${SOURCE_DIR}/INFRA_VERSION"
else
    echo "No INFRA_VERSION found, skip pulling docker images"
fi

if [ ${SELFHOSTED} == 0 ]; then
    echo "!! Initializing Ubuntu image for CaaS"
else
    echo "!! Initializing Ubuntu image for Selfhosting"
fi

echo "==== Create User ${USER} ===="
if ! id "${USER}"; then
    useradd "${USER}" -m
fi

echo "=== Yellowtent base image preparation (installer revision - ${INSTALLER_REVISION}) ==="

export DEBIAN_FRONTEND=noninteractive

echo "=== Upgrade ==="
apt-get update
apt-get upgrade -y
apt-get install -y curl

# Setup firewall before everything. docker creates it's own chain and the -X below will remove it
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
if [ ${SELFHOSTED} == 0 ]; then
    iptables -A INPUT -p tcp -m tcp -m multiport --dports 80,202,443,886 -j ACCEPT
else
    iptables -A INPUT -p tcp -m tcp -m multiport --dports 80,22,443,886 -j ACCEPT
fi
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A INPUT -s 172.17.0.0/16 -j ACCEPT # required to accept any connections from apps to our IP:<public port>

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

echo "==== Install btrfs tools ==="
apt-get -y install btrfs-tools

echo "==== Install docker ===="
# install docker from binary to pin it to a specific version. the current debian repo does not allow pinning
curl https://get.docker.com/builds/Linux/x86_64/docker-1.9.1 > /usr/bin/docker
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
ExecStart=/usr/bin/docker daemon -H fd:// --log-driver=journald --exec-opt native.cgroupdriver=cgroupfs
MountFlags=slave
LimitNOFILE=1048576
LimitNPROC=1048576
LimitCORE=infinity

[Install]
WantedBy=multi-user.target
EOF

echo "=== Setup btrfs docker data ==="
fallocate -l "8192m" "${USER_DATA_FILE}" # 8gb start
mkfs.btrfs -L UserHome "${USER_DATA_FILE}"
echo "${USER_DATA_FILE} ${USER_DATA_DIR} btrfs loop,nosuid 0 0" >> /etc/fstab
mkdir -p "${USER_DATA_DIR}" && mount "${USER_DATA_FILE}"

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
sed -e 's/GRUB_CMDLINE_LINUX=.*/GRUB_CMDLINE_LINUX="cgroup_enable=memory swapaccount=1 panic_on_oops=1 panic=5"/' -i /etc/default/grub
update-grub

# now add the user to the docker group
usermod "${USER}" -a -G docker

if [ -z $(echo "${INFRA_VERSION}") ]; then
    echo "Skip pulling base docker images"
else
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
fi

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

# this simply makes it explicit that we run logrotate via cron. it's already part of base ubuntu
echo "==== Install logrotate ==="
apt-get install -y cron logrotate
systemctl enable cron

echo "==== Extracting installer source ===="
rm -rf "${INSTALLER_SOURCE_DIR}" && mkdir -p "${INSTALLER_SOURCE_DIR}"
tar xvf /root/installer.tar -C "${INSTALLER_SOURCE_DIR}" && rm /root/installer.tar
echo "${INSTALLER_REVISION}" > "${INSTALLER_SOURCE_DIR}/REVISION"

echo "==== Install nodejs ===="
# Cannot use anything above 4.1.1 - https://github.com/nodejs/node/issues/3803
mkdir -p /usr/local/node-4.1.1
curl -sL https://nodejs.org/dist/v4.1.1/node-v4.1.1-linux-x64.tar.gz | tar zxvf - --strip-components=1 -C /usr/local/node-4.1.1
ln -s /usr/local/node-4.1.1/bin/node /usr/bin/node
ln -s /usr/local/node-4.1.1/bin/npm /usr/bin/npm
apt-get install -y python   # Install python which is required for npm rebuild

echo "=== Rebuilding npm packages ==="
cd "${INSTALLER_SOURCE_DIR}" && npm install --production
chown "${USER}:${USER}" -R "${INSTALLER_SOURCE_DIR}"

echo "==== Install installer systemd script ===="
provisionEnv="digitalocean"
if [ ${SELFHOSTED} == 1 ]; then
    provisionEnv="PROVISION=local"
fi

cat > /etc/systemd/system/cloudron-installer.service <<EOF
[Unit]
Description=Cloudron Installer

[Service]
Type=idle
ExecStart="${INSTALLER_SOURCE_DIR}/src/server.js"
Environment="DEBUG=installer*,connect-lastmile" ${provisionEnv}
KillMode=process
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

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

systemctl daemon-reload
systemctl enable cloudron-installer
systemctl enable iptables-restore
systemctl enable box-setup

# Configure systemd
sed -e "s/^#SystemMaxUse=.*$/SystemMaxUse=100M/" \
    -e "s/^#ForwardToSyslog=.*$/ForwardToSyslog=no/" \
    -i /etc/systemd/journald.conf

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

if [ ${SELFHOSTED} == 0 ]; then
    echo "==== Install ssh ==="
    apt-get -y install openssh-server
    # https://stackoverflow.com/questions/4348166/using-with-sed on why ? must be escaped
    sed -e 's/^#\?Port .*/Port 202/g' \
        -e 's/^#\?PermitRootLogin .*/PermitRootLogin without-password/g' \
        -e 's/^#\?PermitEmptyPasswords .*/PermitEmptyPasswords no/g' \
        -e 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/g' \
        -i /etc/ssh/sshd_config

    # required so we can connect to this machine since port 22 is blocked by iptables by now
    systemctl reload sshd
fi
