#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# enable carbon-cache daemon. init.d script checks for this value for some reason
sed -i -e "s/CARBON_CACHE_ENABLED=false/CARBON_CACHE_ENABLED=true/" /etc/default/graphite-carbon

cp $SCRIPT_DIR/graphite/carbon.conf /etc/carbon/carbon.conf
cp $SCRIPT_DIR/graphite/storage-schemas.conf /etc/carbon/storage-schemas.conf

/usr/bin/graphite-build-search-index
service carbon-cache start

# graphite
cp $SCRIPT_DIR/graphite/local_settings.py /etc/graphite/local_settings.py
graphite-manage syncdb --noinput
chown _graphite._graphite /var/lib/graphite/graphite.db

cp $SCRIPT_DIR/graphite/graphite-uwsgi.ini /etc/uwsgi/apps-available/graphite-uwsgi.ini
ln -s /etc/uwsgi/apps-available/graphite-uwsgi.ini /etc/uwsgi/apps-enabled/graphite-uwsgi.ini
service uwsgi restart

# collectd
cp $SCRIPT_DIR/collectd/collectd.conf /etc/collectd/collectd.conf
service collectd restart
