The Box
=======

Development setup
-----------------
* sudo useradd -m yellowtent
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
* `mkdir -p $HOME/.yellowtent/data` - create data directory
* `npm run-script migrate` - this sets up the database
* Setup initial webadmin oauth client credentials:
```bash
export ADMIN_ID=$(cat /proc/sys/kernel/random/uuid)
export ADMIN_ORIGIN=https://admin-localhost
export ADMIN_SCOPES="root,profile,users,apps,settings,roleAdmin"
sqlite3 ~/.yellowtent/data/cloudron.sqlite "INSERT OR REPLACE INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) VALUES (\"\$ADMIN_ID\", \"webadmin\", \"cid-webadmin\", \"secret-webadmin\", \"WebAdmin\", \"$ADMIN_ORIGIN\", \"\$ADMIN_SCOPES\")"
```
* `./run.sh` - this starts up nginx to serve up the webadmin
* make sure at first run that the env variable `APP_SERVER_URL` is set to **https://cloudron-dev.herokuapp.com**
* `DEBUG=box:* ./app.js` - this the main box code. `NODE_ENV` is set to `production` by default.
* Navigate to https://admin-localhost

Deployment setup
----------------
Creating a box image involves the following steps:
* scripts/createDigitalOceanImage.sh <GIT_REF>
* This should spit out a image id at the end of the script

