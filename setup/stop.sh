#!/bin/bash

set -eu -o pipefail

echo "Stopping cloudron"

# we do not wait until all services stop, so we can still respond to the retire request
systemctl stop --no-block cloudron.target
