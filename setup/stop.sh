#!/bin/bash

set -eu -o pipefail

echo "Stopping cloudron"

systemctl stop cloudron.target
