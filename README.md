The Box
=======

Development setup
-----------------
* sudo adduser yellowtent
** This dummy user is required for supervisor 'box' configs

* rmappdir.sh should be callable without a password
** Add a file called /etc/sudoers.d/yellowtent with the following contents:
    Defaults!/home/girish/yellowtent/box/src/scripts/rmappdir.sh env_keep=HOME
    girish ALL = (ALL) NOPASSWD: /home/girish/yellowtent/box/src/scripts/rmappdir.sh
    Defaults!/home/girish/yellowtent/box/src/scripts/reloadnginx.sh env_keep=HOME
    girish ALL = (ALL) NOPASSWD: /home/girish/yellowtent/box/src/scripts/reloadnginx.sh
    Defaults!/Users/girishra/research/yellowtent/box/src/scripts/backup.sh env_keep=HOME
    girishra ALL = (ALL) NOPASSWD: /Users/girishra/research/yellowtent/box/src/scripts/backup.sh
    Defaults!/Users/girishra/research/yellowtent/box/src/scripts/update.sh env_keep=HOME
    girishra ALL = (ALL) NOPASSWD: /Users/girishra/research/yellowtent/box/src/scripts/update.sh

   (replace the username and path to rmappdir.sh to match your environment)

   You might have to clear the sudo cache using sudo -k.

** Verify using `sudo src/scripts/rmappdir.sh --check`. This should print 'OK'
** Verify using `sudo src/scripts/reloadnginx.sh --check`. This should print 'OK'
** Verify using `sudo src/scripts/backup.sh --check`. This should print 'OK'
** Verify using `sudo src/scripts/update.sh --check`. This should print 'OK'

** Add admin-localhost as 127.0.0.1 in /etc/hosts
** All apps will be installed as hypened-subdomains of localhost. You should add
   hyphened-subdomains of your apps into /etc/hosts

Running
-------
* ./run.sh - this starts up nginx to serve up the webadmin
** Navigate to https://localhost

* DEBUG=box:* ./app.js - this the main box code
** NODE_ENV is set to production by default

Deployment setup
----------------
Creating a box image involves the following steps:
* scripts/createDigitalOceanImage.sh <GIT_REF>
* This should spit out a image id at the end of the script

