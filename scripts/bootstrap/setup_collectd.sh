#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

docker run -p 127.0.0.1:2003:2003 -p 127.0.0.1:2004:2004 -p 127.0.0.1:8000:8000 --name="graphite" girish/graphite:0.1

# collectd
cp $SCRIPT_DIR/collectd/collectd.conf /etc/collectd/collectd.conf
service collectd restart
