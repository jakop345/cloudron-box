The Box
=======

Development setup
-----------------
* sudo adduser yellowtent
** This dummy user is required for supervisor 'box' configs

Running
-------
* ./run.sh - this starts up nginx to serve up the webadmin
** https://HOSTNAME should now be accessible
** https://localhost will also work but will break oauth redirection

* DEBUG=box:* ./app.js - this the main box code
** NODE_ENV is set to production by default
