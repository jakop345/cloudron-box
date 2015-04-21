#!/bin/bash

set -eu -o pipefail

# This file can be used in Dockerfile

readonly container_files="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/container"

########## logrotate (default ubuntu runs this daily)
rm -rf /etc/logrotate.d/*
cp -r "${container_files}/logrotate/" /etc/logrotate.d/

########## supervisor
rm -rf /etc/supervisor/*
cp -r "${container_files}/supervisor/" /etc/supervisor/

########## sudoers
rm /etc/sudoers.d/*
cp -r "${container_files}/sudoers" /etc/sudoers.d/yellowtent

########## collectd
rm -rf /etc/collectd
ln -sfF "/home/yellowtent/configs/collectd" /etc/collectd
cp -r "${container_files}/collectd.conf" "/home/yellowtent/configs/collectd/collectd.conf"

########## Restart services (this is only needed since we are not a real container)
update-rc.d -f collectd defaults
/etc/init.d/collectd restart

