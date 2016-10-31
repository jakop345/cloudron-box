# Installer

This subfolder contains all resources, which persist across a Cloudron update.
Only code and assets, which are part of the updater belong here.

Installer is the name which got inherited from times, where this folder contained
much more infrastructure components, like a local webserver to facilitate updates.


## installer.sh

The main entry point for initial provisioning and also updates (not upgrades).

It is called from:
 * cloudron-setup (during initial provisioning, restoring or upgrade)
 * cloudron.js in the box code (during an update)

Two arguments need to be supplied in this order:
 1. The public url to download the box release tarball `--sourcetarballurl`
 2. JSON object which contains the user-data `--data`


## box-setup.sh

This is the systemd unit file script hook, which persists Cloudron updates.
Mostly it revolves around setting up various parts of the filesystem, like btrfs
volumes and swap files
