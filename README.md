The Box
=======

Development setup
-----------------
* sudo adduser yellowtent
** This dummy user is required for supervisor 'box' configs

* rmdirapp.sh should be callable without a password
** Add a file called /etc/sudoers.d/yellowtent with the following contents:
   Defaults!/home/girish/yellowtent/box/src/rmappdir.sh env_keep=HOME
   girish ALL = (ALL) NOPASSWD: /home/girish/yellowtent/box/src/rmappdir.sh

   (replace the username and path to rmappdir.sh to match your environment)

** Verify using rmdirapp.sh --check . This should print 'OK'

Running
-------
* ./run.sh - this starts up nginx to serve up the webadmin
** https://HOSTNAME should now be accessible
** https://localhost will also work but will break oauth redirection

* DEBUG=box:* ./app.js - this the main box code
** NODE_ENV is set to production by default
