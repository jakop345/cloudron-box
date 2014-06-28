The Box
=======

Development setup
-----------------
* sudo adduser yellowtent
** This dummy user is required for supervisor 'box' configs

* rmappdir.sh should be callable without a password
** Add a file called /etc/sudoers.d/yellowtent with the following contents:
   Defaults!/home/girish/yellowtent/box/src/rmappdir.sh env_keep=HOME
   girish ALL = (ALL) NOPASSWD: /home/girish/yellowtent/box/src/rmappdir.sh

   (replace the username and path to rmappdir.sh to match your environment)

   You might have to clear the sudo cache using sudo -k.

** Verify using `sudo rmappdir.sh --check`. This should print 'OK'

Running
-------
* ./run.sh - this starts up nginx to serve up the webadmin
** https://HOSTNAME should now be accessible
** Do not use https://localhost. It will appear to work work but will break oauth redirection

* DEBUG=box:* ./app.js - this the main box code
** NODE_ENV is set to production by default
