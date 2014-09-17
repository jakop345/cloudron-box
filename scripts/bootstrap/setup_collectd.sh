#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

GRAPHITE_DIR="/home/yellowtent/.yellowtent/graphite"
mkdir $GRAPHITE_DIR

docker run -d --name="graphite" \
    -p 127.0.0.1:2003:2003 \
    -p 127.0.0.1:2004:2004 \
    -p 127.0.0.1:8000:8000 \
    -v $GRAPHITE_DIR:/app/data girish/graphite:0.2

# collectd
cp $SCRIPT_DIR/collectd/collectd.conf /etc/collectd/collectd.conf
service collectd restart
