#!/bin/bash

set -euv -o pipefail

readonly USER=yellowtent
readonly USER_HOME="/home/${USER}"
readonly DATA_DIR="${USER_HOME}/data"
readonly APPDATA="${DATA_DIR}/appdata"
readonly INSTALLER_SOURCE_DIR="${USER_HOME}/installer"
readonly INSTALLER_REVISION="$1"
readonly DOCKER_DATA_FILE="/root/docker_data.img"
readonly USER_HOME_FILE="/root/user_home.img"

echo "==== Create User ${USER} ===="
if ! id "${USER}"; then
    useradd "${USER}" -m
fi

echo "=== Yellowtent base image preparation (installer revision - ${INSTALLER_REVISION}) ==="

export DEBIAN_FRONTEND=noninteractive

# Allocate two sets of swap files - one for general app usage and another for backup
# The backup swap is setup for swap on the fly by the backup scripts
echo "=== Setup swap file ==="
apps_swap_file="/apps.swap"
[[ -f "${apps_swap_file}" ]] && swapoff "${apps_swap_file}"
fallocate -l 1024m "${apps_swap_file}"
chmod 600 "${apps_swap_file}"
mkswap "${apps_swap_file}"
swapon "${apps_swap_file}"
echo "${apps_swap_file}  none  swap  sw  0 0" >> /etc/fstab

backup_swap_file="/backup.swap"
[[ -f "${backup_swap_file}" ]] && swapoff "${backup_swap_file}"
fallocate -l 1024m "${backup_swap_file}"
chmod 600 "${backup_swap_file}"
mkswap "${backup_swap_file}"

echo "==== Install project dependencies ===="
apt-get update

echo "=== Upgrade ==="
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

echo "==== Install docker ===="
# see http://idolstarastronomer.com/painless-docker.html
echo deb https://get.docker.io/ubuntu docker main > /etc/apt/sources.list.d/docker.list
apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 36A1D7869245C8950F966E92D8576A8BA88D21E9
apt-get update
apt-get -y install lxc-docker-1.7.0
ln -sf /usr/bin/docker.io /usr/local/bin/docker

if [ ! -f "${DOCKER_DATA_FILE}" ]; then
    systemctl stop docker
    if aufs_mounts=$(grep 'aufs' /proc/mounts | awk '{print$2}' | sort -r); then
        umount -l "${aufs_mounts}"
    fi
    rm -rf /var/lib/docker
    mkdir /var/lib/docker

    # create a separate 12GB fs for docker images
    # dd if=/dev/zero of=/root/docker_data.img bs=1M count=12000
    apt-get -y install btrfs-tools
    truncate -s 12G "${DOCKER_DATA_FILE}"
    mkfs.btrfs -L DockerData "${DOCKER_DATA_FILE}"
    echo "${DOCKER_DATA_FILE} /var/lib/docker btrfs loop,nosuid 0 0" >> /etc/fstab
    echo 'DOCKER_OPTS="-s btrfs"' >> /etc/default/docker
    mount "${DOCKER_DATA_FILE}"

    systemctl start docker
    # give docker sometime to start up and create iptables rules
    sleep 10
fi

# ubuntu will restore iptables from this file automatically. this is here so that docker's chain is saved to this file
mkdir /etc/iptables && iptables-save > /etc/iptables/rules.v4

# now add the user to the docker group
usermod "${USER}" -a -G docker
echo "=== Pulling base docker images ==="
docker pull cloudron/base:0.3.1

echo "=== Pulling mysql addon image ==="
docker pull cloudron/mysql:0.3.1

echo "=== Pulling postgresql addon image ==="
docker pull cloudron/postgresql:0.3.1

echo "=== Pulling redis addon image ==="
docker pull cloudron/redis:0.3.1

echo "=== Pulling mongodb addon image ==="
docker pull cloudron/mongodb:0.3.1

echo "=== Pulling graphite docker images ==="
docker pull cloudron/graphite:0.3.1

echo "=== Pulling mail relay ==="
docker pull cloudron/mail:0.3.1

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

echo "==== Install supervisor ===="
apt-get -y install supervisor

echo "==== Install collectd ==="
apt-get install -y collectd collectd-utils
update-rc.d -f collectd remove

echo "==== Seting up btrfs user home ==="
if [[ ! -f "${USER_HOME_FILE}" ]]; then
    # create a separate 12GB fs for data
    truncate -s 12G "${USER_HOME_FILE}"
    mkfs.btrfs -L UserHome "${USER_HOME_FILE}"
    echo "${USER_HOME_FILE} ${USER_HOME} btrfs loop,nosuid 0 0" >> /etc/fstab
    mount "${USER_HOME_FILE}"
    btrfs subvolume create "${USER_HOME}/data"
fi

echo "=== Install tmpreaper ==="
sudo apt-get install -y tmpreaper
sudo sed -e 's/SHOWWARNING=true/# SHOWWARNING=true/' -i /etc/tmpreaper.conf

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

echo "==== Make the user own his home ===="
chown "${USER}:${USER}" -R "/home/${USER}"

echo "==== Install init script ===="
cat > /etc/init.d/cloudron-bootstrap <<EOF
#!/bin/bash

set -eu

readonly FOREVER="${INSTALLER_SOURCE_DIR}/node_modules/.bin/forever"
readonly INSTALLER_LOG="/var/log/cloudron/installserver.log"
readonly FOREVER_LOG="/var/log/cloudron/forever.log"

case "\$1" in
    start)
        mkdir -p /var/log/cloudron

        # this is a hack to fix ordering of iptables-restore and docker startup
        iptables-restore < /etc/iptables/rules.v4
        systemctl restart docker

        DEBUG="installer*,connect-lastmile" "\${FOREVER}" start -a -l "\${FOREVER_LOG}" -o "\${INSTALLER_LOG}" -e "\${INSTALLER_LOG}" "${INSTALLER_SOURCE_DIR}/src/server.js"
        ;;
    restart|reload|force-reload)
        "\${FOREVER}" restart "${INSTALLER_SOURCE_DIR}/src/server.js"
        ;;
    stop)
        "\${FOREVER}" stop "${INSTALLER_SOURCE_DIR}/src/server.js"
        ;;
    *)
        echo "Usage: \$0 start|stop|restart" >&2
        exit 3
        ;;
esac
EOF

chmod +x /etc/init.d/cloudron-bootstrap
update-rc.d cloudron-bootstrap defaults 99

sync

