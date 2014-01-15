YellowTent Server
=================

Systemd
-------

Yellowtent needs to be installed globally.

```
sudo npm install -g .
```

Copy the `yellowtent.service` file to `/usr/lib/systemd/system` and create a `yellowtent` user and group.

```
sudo cp yellowtent.service /usr/lib/systemd/system/
sudo useradd -mrU yellowtent
sudo systemctl start yellowtent

# or permanently enable it
sudo systemctl enable yellowtent
```
