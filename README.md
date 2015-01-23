The Box
=======

Development setup
-----------------
* sudo useradd -m yellowtent
** This dummy user is required for supervisor 'box' configs
** Add admin-localhost as 127.0.0.1 in /etc/hosts
** All apps will be installed as hypened-subdomains of localhost. You should add
   hyphened-subdomains of your apps into /etc/hosts

Running
-------
* `./run.sh` - this starts up nginx to serve up the webadmin
* `DEBUG=box:* ./app.js` - this the main box code.
* Navigate to https://admin-localhost

