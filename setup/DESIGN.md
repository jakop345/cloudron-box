This document gives the design of this setup code.

box code should be delivered in the form of a (docker) container.
This is not the case currently but we want to do structure the code
in spirit that way.

### container.sh
This contains code that essential goes into Dockerfile.

This file contains static configuration over a base image. Currently,
the yellowtent user is created in the installer base image but it
could very well be placed here.

The idea is that the installer would simply remove the old box container
and replace it with a new one for an update.

Because we do not package things as Docker yet, we should be careful
about the code here. We have to expect remains of an older setup code.
For example, older supervisor or nginx configs might be around.

The config directory is _part_ of the container and is not a VOLUME.
Which is to say that the files will be nuked from one update to the next.

The data directory is a VOLUME. Contents of this directory are expected
to survive an update. This is a good place to place config files that
are "dynamic" and need to survive restarts. For example, the infra
version (see below) or the mysql/postgresql data etc.

### start.sh
  * It is called in 3 modes - new, update, restore.

  * The first thing this does is to do the static container.sh setup.

  * It then downloads any box restore data and restores the box db from the
    backup.

  * It then proceeds to call the db-migrate script.

  * It then does dynamic configuration like setting up nginx, collectd.

  * It then setups up the cloud infra (setup_infra.sh) and creates cloudron.conf.

  * supervisor is then started

setup_infra.sh
This setups containers like graphite, mail and the addons containers.

Containers are relaunched based on the INFRA_VERSION. The script compares
the version here with the version in the file DATA_DIR/INFRA_VERSION.

If they match, the containers are not recreated and nothing is to be done.
nginx, collectd configs are part of data already and containers are running.

If they do not match, it deletes all containers (including app containers) and starts
them all afresh. Important thing here is that, DATA_DIR is never removed across
updates. So, it is only the containers being recreated and not the data.

