The Box
=======

Development setup
-----------------
* sudo adduser yellowtent
** This dummy user is required for supervisor 'box' configs

** Add a file called /etc/sudoers.d/yellowtent with the following contents:

    Defaults!/home/girish/yellowtent/box/src/scripts/rmappdir.sh env_keep=HOME
    girish ALL=(ALL) NOPASSWD: /home/girish/yellowtent/box/src/scripts/rmappdir.sh
    Defaults!/home/girish/yellowtent/box/src/scripts/reloadnginx.sh env_keep=HOME
    girish ALL=(ALL) NOPASSWD: /home/girish/yellowtent/box/src/scripts/reloadnginx.sh
    Defaults!/home/girish/yellowtent/box/src/scripts/backup.sh env_keep=HOME
    girish ALL=(ALL) NOPASSWD: /home/girish/yellowtent/box/src/scripts/backup.sh
    Defaults!/home/girish/yellowtent/box/src/scripts/reboot.sh env_keep=HOME
    girish ALL=(ALL) NOPASSWD: /home/girish/yellowtent/box/src/scripts/reboot.sh
    Defaults!/home/girish/yellowtent/box/src/scripts/reloadcollectd.sh env_keep=HOME
    girish ALL=(root) NOPASSWD: /home/girish/box/src/scripts/reloadcollectd.sh

   (replace the path to the scripts to match your environment)

   You might have to clear the sudo cache using sudo -k.

** scripts/checkInstall.sh

** Add admin-localhost as 127.0.0.1 in /etc/hosts
** All apps will be installed as hypened-subdomains of localhost. You should add
   hyphened-subdomains of your apps into /etc/hosts

Running
-------
* ./run.sh - this starts up nginx to serve up the webadmin
** Navigate to https://admin-localhost

* DEBUG=box:* ./app.js - this the main box code
** NODE_ENV is set to production by default

Deployment setup
----------------
Creating a box image involves the following steps:
* scripts/createDigitalOceanImage.sh <GIT_REF>
* This should spit out a image id at the end of the script

