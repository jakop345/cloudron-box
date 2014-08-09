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
   Defaults!/home/girish/yellowtent/box/src/reloadnginx.sh env_keep=HOME
   girish ALL = (ALL) NOPASSWD: /home/girish/yellowtent/box/src/reloadnginx.sh

   (replace the username and path to rmappdir.sh to match your environment)

   You might have to clear the sudo cache using sudo -k.

** Verify using `sudo src/rmappdir.sh --check`. This should print 'OK'
** Verify using `sudo src/reloadnginx.sh --check`. This should print 'OK'

* Set your hostname to 'mybox.cloudron.us'
** On Mac, settings the hostname through command line resets the name periodically.
   Using the network control panel, always appends a .local suffix.
   Workaround: sudo scutil --set HostName mybox.cloudron.us

* export FQDN='mybox.cloudron.us' (add this to your .bashrc)
** Add the above domain to your /etc/hosts
** All apps will be installed as hypened-subdomains of the above FQDN
** You should add hyphened-subdomains of your apps into /etc/hosts

Running
-------
* ./run.sh - this starts up nginx to serve up the webadmin
** https://mybox.cloudron.us should now be accessible
** Do not use https://localhost. It will appear to work work but will break oauth redirection

* DEBUG=box:* ./app.js - this the main box code
** NODE_ENV is set to production by default

Deployment setup
----------------
Creating a box image involves the following steps:
* Start a vanilla Ubuntu DO
* scripts/createBaseUbuntuImage.sh <DROPLET_IP>
* Snapshot the image in DO
* Change heroku config to that image id above
  * curl "https://api.digitalocean.com/v1/images/?client_id=f18dbe3b7090fa0a3f6878709dd555aa&api_key=ee47d2d5b2f2a4281508e3a962c488fc" | python -m json.tool
  * heroku config:set DIGITAL_OCEAN_IMAGE=5561068
