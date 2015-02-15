#!/bin/bash

set -eux

readonly LOGROTATE_CONFIG_DIR="/etc/logrotate.d"

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp -f "${script_dir}/logrotate/supervisor" "${LOGROTATE_CONFIG_DIR}/"
cp -f "${script_dir}/logrotate/cloudron" "${LOGROTATE_CONFIG_DIR}/"

# logrotate is setup by default on ubuntu and is scheduled with cron daily