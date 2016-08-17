# Overview

This tutorial outlines how to package an existing web application for the Cloudron.

If you are aware of Docker and Heroku, you should feel at home packaging for the
Cloudron. Roughly, the steps involved are:

* Create a Dockerfile for your application. If your application already has
  a Dockerfile, you should able to reuse most of it. By virtue of Docker, the Cloudron
  is able to run apps written in any language/framework.

* Create a CloudronManifest.json that provides information like title, author, description
   etc. You can also specify the addons (like database) required
  to run your app. When the app runs on the Cloudron, it will have environment
  variables set for connecting to the addon.

* Test the app on your Cloudron with the CLI tool.

* Optionally, submit the app to [Cloudron Store](/appstore.html).

# Prerequisites

## Install CLI tool

The Cloudron CLI tool allows you to install, configure and test apps on your Cloudron.

Installing the CLI tool requires [node.js](https://nodejs.org/) and
[npm](https://www.npmjs.com/). You can then install the CLI tool using the following
command:

```
    sudo npm install -g cloudron
```

Note: Depending on your setup, you can run the above command without `sudo`.

## Login to Cloudron

The `cloudron` command should now be available in your path.

You can login to your Cloudron now:

```
$ cloudron login
Cloudron Hostname: craft.selfhost.io

Enter credentials for craft.selfhost.io:
Username: girish
Password:
Login successful.
```

# Basic app

We will first package a very simple app to understand how the packaging works.
You can clone this app from https://git.cloudron.io/cloudron/tutorial-basic.

## The server

The basic app server is a very simple HTTP server that runs on port 8000.
While the server in this tutorial uses node.js, you can write your server
in any language you want.

```server.js
var http = require("http");

var server = http.createServer(function (request, response) {
  response.writeHead(200, {"Content-Type": "text/plain"});
  response.end("Hello World\n");
});

server.listen(8000);

console.log("Server running at port 8000");
```

## Dockerfile

The Dockerfile contains instructions on how to create an image for your application.

```Dockerfile
FROM cloudron/base:0.8.1

ADD server.js /app/code/server.js

CMD [ "/usr/local/node-4.2.1/bin/node", "/app/code/server.js" ]
```

The `FROM` command specifies that we want to start off with Cloudron's [base image](/references/baseimage.html).
All Cloudron apps **must** start from this base image. This approach conserves space on the Cloudron since
Docker images tend to be quiet large.

The `ADD` command copies the source code of the app into the directory `/app/code`. There is nothing special
about the `/app/code` directory and it is merely a convention we use to store the application code.

The `CMD` command specifies how to run the server. The base image already contains many different versions of
node.js. We use Node 4.2.1 here.

This Dockerfile can be built and run locally as:
```
docker build -t tutorial .
docker run -p 8000:8000 -ti tutorial
```

## Manifest

The `CloudronManifest.json` specifies

* Information for installing and running the app on the Cloudron. This includes fields like addons, httpPort, tcpPorts.

* Information about displaying the app on the Cloudron Store. For example, fields like title, author, description.

Create the CloudronManifest.json using `cloudron init` as follows:

```
$ cloudron init
id: io.cloudron.tutorial                       # unique id for this app. use reverse domain name convention
author: John Doe                               # developer or company name of the for user <email>
title: Tutorial App                            # Cloudron Store title of this app
description: App that uses node.js             # A string or local file reference like file://DESCRIPTION.md
tagline: Changing the world one app at a time  # A tag line for this app for the Cloudron Store
website: https://cloudron.io                   # A link to this app's website
contactEmail: support@cloudron.io              # Contact email of developer or company
httPort: 8000                                  # The http port on which this application listens to
```

The above command creates a CloudronManifest.json:

File ```tutorial/CloudronManifest.json```

```json
{
  "id": "io.cloudron.tutorial",
  "title": "Tutorial App",
  "author": "John Doe",
  "description": "file://DESCRIPTION.md",
  "changelog": "file://CHANGELOG",
  "tagline": "Changing the world one app at a time",
  "version": "0.0.1",
  "healthCheckPath": "/",
  "httpPort": 8000,
  "addons": {
    "localstorage": {}
  },
  "manifestVersion": 1,
  "website": "https://cloudron.io",
  "contactEmail": "support@cloudron.io",
  "icon": "",
  "tags": [
    "changme"
  ],
  "mediaLinks": [ ]
}
```

You can read in more detail about each field in the [Manifest reference](/references/manifest.html). The
`localstorage` addon allows the app to store files in `/app/data`. We will explore addons further further
down in this tutorial.

Additional files created by `init` are:
* `DESCRIPTION.md` - A markdown file providing description of the app for the Cloudron Store.
* `CHANGELOG` - A file containing change information for each version released to the Cloudron Store. This
  information is shown when the user updates the app.

# Installing

We now have all the necessary files in place to build and deploy the app to the Cloudron.

## Building

Building, pushing and pulling docker images can be very bandwidth and CPU intensive. To alleviate this
problem, apps are built using the `build service` which uses `cloudron.io` account credentials.

**Warning**: As of this writing, the build service uses the public Docker registry and the images that are built
can be downloaded by anyone. This means that your source code will be viewable by others.

Initiate a build using ```cloudron build```:
```
$ cloudron build
Building io.cloudron.tutorial@0.0.1

Appstore login:
Email: ramakrishnan.girish@gmail.com         # cloudron.io account
Password:                                    # Enter password
Login successful.

Build scheduled with id e7706847-f2e3-4ba2-9638-3f334a9453a5
Waiting for build to begin, this may take a bit...
Downloading source
Building
Step 1 : FROM cloudron/base:0.8.1
 ---> be9fc6312b2d
Step 2 : ADD server.js /app/code/server.js
 ---> 10513e428d7a
Removing intermediate container 574573f6ed1c
Step 3 : CMD /usr/local/node-4.2.1/bin/node /app/code/server.js
 ---> Running in b541d149b6b9
 ---> 51aa796ea6e5
Removing intermediate container b541d149b6b9
Successfully built 51aa796ea6e5
Pushing
The push refers to a repository [docker.io/cloudron/img-062037096d69bbf3ffb5b9316ad89cb9] (len: 1)
Pushed 51aa796ea6e5
Pushed 10513e428d7a
Image already exists be9fc6312b2d
Image already exists a0261a2a7c75
Image already exists f9d4f0f1eeed
Image already exists 2b650158d5d8
e7706847-f2e3-4ba2-9638-3f334a9453a5: digest: sha256:8241d68b65874496191106ecf2ee8f3df2e05a953cd90ff074a6f8815a49389c size: 26098
Build succeeded
Success
```

## Installing

Now that we have built the image, we can install our latest build on the Cloudron
using the following command:

```
$ cloudron install
Using cloudron craft.selfhost.io
Using build 76cebfdd-7822-4f3d-af17-b3eb393ae604 from 1 hour ago
Location: tutorial                         # This is the location into which the application installs
App is being installed with id: 4dedd3bb-4bae-41ef-9f32-7f938995f85e

 => Waiting to start installation
 => Registering subdomain .
 => Verifying manifest .
 => Downloading image ..............
 => Creating volume .
 => Creating container
 => Setting up collectd profile ................
 => Waiting for DNS propagation ...

App is installed.
```

Open the app in your default browser:
```
cloudron open
```

You should see `Hello World`.

# Testing

The application testing cycle involves `cloudron build` and `cloudron install`.
Note that `cloudron install` updates an existing app in place.

You can view the logs using `cloudron logs`. When the app is running you can follow the logs
using `cloudron logs -f`.

For example, you can see the console.log output in our server.js with the command below:

```
$ cloudron logs
Using cloudron craft.selfhost.io
16:44:11 [main] Server running at port 8000
```

It is also possible to run a *shell* and *execute* arbitrary commands in the context of the application
process by using `cloudron exec`. By default, exec simply drops you into an interactive bash shell with
which you can inspect the file system and the environment.

```
$ cloudron exec
```

You can also execute arbitrary commands:
```
$ cloudron exec env # display the env variables that your app is running with
```

### DevelopmentMode

When debugging complex startup scripts, one can specify `"developmentMode": true,` in the CloudronManifest.json.
This will ignore the `RUN` command, specified in the Dockerfile and allows the developer to interactively test
the startup scripts using `cloudron exec`.

**Note:** that an app running in this mode has full read/write access to the filesystem and all memory limits are lifted.


# Addons

## Filesystem

The application container created on the Cloudron has a `readonly` file system. Writing to any location
other than the below will result in an error:

* `/tmp` - Use this location for temporary files. The Cloudron will cleanup any files in this directory
  periodically.

* `/run` - Use this location for runtime configuration and dynamic data. These files should not be expected
  to persist across application restarts (for example, after an update or a crash).

* `/app/data` - Use this location to store application data that is to be backed up. To use this location,
  you must use the [localstorage](/references/addons.html#localstorage) addon. For convenience, the initial CloudronManifest.json generated by
  `cloudron init` already contains this addon.

## Database

Most web applications require a database of some form. In theory, it is possible to run any
database you want as part of the application image. This is, however, a waste of server resources
should every app runs it's own database server.

Cloudron currently provides [mysql](/references/addons.html#mysql), [postgresql](/references/addons.html#postgresql),
[mongodb](/references/addons.html#mongodb), [redis](/references/addons.html#redis) database addons. When choosing
these addons, the Cloudron will inject environment variables that contain information on how to connect
to the addon.

See https://git.cloudron.io/cloudron/tutorial-redis for a simple example of how redis can be used by
an application. The server simply uses the environment variables to connect to redis.

## Email

Cloudron applications can send email using the `sendmail` addon. Using the `sendmail` addon provides
the SMTP server and authentication credentials in environment variables.

Cloudron applications can also receive mail via IMAP using the `recvmail` addon.

## Authentication

The Cloudron has a centralized panel for managing users and groups. Apps can integrate Single Sign-On
authentication using LDAP or OAuth.

Apps can integrate with the Cloudron authentication system using LDAP, OAuth or Simple Auth. See the
[authentication](/references/authentication.html) reference page for more details.

See https://git.cloudron.io/cloudron/tutorial-ldap for a simple example of how to authenticate via LDAP.

For apps that are single user can skip Single Sign-On support by setting the `"singleUser": true`
in the manifest. By doing so, the Cloudron will installer will show a dialog to choose a user.

For app that have no user management at all, the Cloudron implements an `OAuth proxy` that 
optionally lets the Cloudron admin make the app visible only for logged in users.

# Best practices

## No Setup

A Cloudron app is meant to instantly usable after installation. For this reason, Cloudron apps must not
show any setup screen after installation and should simply choose reasonable defaults.

Databases, email configuration should be automatically picked up from the environment variables using
addons.

## Dockerfile

The app is run as a read-only docker container. Because of this:
* Install any required packages in the Dockerfile.
* Create static configuration files in the Dockerfile.
* Create symlinks to dynamic configuration files under /run in the Dockerfile.

## Process manager

Docker supports restarting processes natively. Should your application crash, it will be restarted
automatically. If your application is a single process, you do not require any process manager.

Use supervisor, pm2 or any of the other process managers if you application has more then one component.
This **excludes** web servers like apache, nginx which can already manage their children by themselves.
Be sure to pick a process manager that forwards signals to child processes.

## Automatic updates

Some apps support automatic updates by overwriting themselves. A Cloudron app cannot overwrite itself
because of the read-only file system. For this reason, disable auto updates for app and let updates be
triggered through the Cloudron Store. This ties in better to the Cloudron's update and restore approach
should something go wrong with the update.

## Logging

Cloudron applications stream their logs to stdout and stderr. In practice, this ideal is hard to achieve.
Some programs like apache simply don't log to stdout. In those cases, simply log to `/tmp` or `/run`.

Logging to stdout has many advantages:
* App does not need to rotate logs and the Cloudron takes care of managing logs.
* App does not need special mechanism to release log file handles (on a log rotate).
* Integrates better with tooling like cloudron cli.

## Memory

By default, applications get 200MB RAM (including swap). This can be changed using the `memoryLimit`
field in the manifest.

Design your application runtime for concurrent use by 50 users. The Cloudron is not designed for
concurrent access by 100s or 1000s of users.

## Authentication

Apps should integrate with one of the [authentication strategies](/references/authentication.html).
This saves the user from having to manage separate set of credentials for each app.

## Startup Script

Many apps do not launch the server directly, as we did in our basic example. Instead, they execute
a `start.sh` script (named so by convention) which launches the server. Before starting the server,
the `start.sh` script does the following:

  * When using the `localstorage` addon, it changes the ownership of files in `/app/data` as desired using `chown`. This
    is necessary because file permissions may not be correctly preserved across backup, restore, application and base image
    updates.

  * Addon information (mail, database) exposed as environment  are subject to change across restarts and an application
    must use these values directly (i.e not cache them across restarts). For this reason, it usually regenerates
    any config files with the current database settings on each invocation.

  * Finally, it starts the server as a non-root user.

The app's main process must handle SIGTERM and forward it as required to child processes. bash does not
automatically forward signals to child processes. For this reason, when using a startup shell script,
remember to use exec <app> as the last line. Doing so will replace bash with your program and allows 
your program to handle signals as required.

# Beta Testing

Once your app is ready, you can upload it to the store for `beta testing` by
other Cloudron users. This can be done using:

```
  cloudron upload
```

The app should now be visible in the Store view of your cloudron under
the 'Testing' section. You can check if the icon, description and other details
appear correctly.

Other Cloudron users can install your app on their Cloudron's using
`cloudron install --appstore-id <appid@version>`.

# Publishing

Once you are satisfied with the beta testing, you can submit it for review.

```
  cloudron submit
```

The cloudron.io team will review the app and publish the app to the store.

# Updating the app

## Versioning

To create an update for an app, simply bump up the [semver version](/references/manifest.html#version) field in
the manifest and publish a new version to the store. 

The Cloudron chooses the next app version to update to based on the following algorithm:
* Choose the maximum `patch` version matching the app's current `major` and `minor` version.
* Failing the above, choose the maximum patch version of the next minor version matching the app's current `major` version.
* Failing the above, choose the maximum patch and minor version of the next major version

For example, let's assume the versions 1.1.3, 1.1.4, 1.1.5, 1.2.4, 1.2.6, 1.3.0, 2.0.0 are published.

* If the app is running 1.1.3, then app will directly update to 1.1.5 (skipping 1.1.4)
* Once in 1.1.5, the app will update to 1.2.6 (skipping 1.2.4)
* Once in 1.2.6, the app will update to 1.3.0
* Once in 1.3.0, the app will update to 2.0.0

The Cloudron admins get notified by email for any major or minor app releases.

## Failed updates

The Cloudron always makes a backup of the app before making an update. Should the
update fail, the user can restore to the backup (which will also restore the app's 
code to the previous version).

# Cloudron Button

The [Cloudron Button](/references/button.html) allows anyone to install your application with the click of a button
on their Cloudron.

The button can be added to just about any website including the application's website
and README.md files in GitHub repositories.

# Next steps

Congratulations! You are now well equipped to build web applications for the Cloudron.

You can see some examples of how real apps are packaged here:

  * [Lets Chat](https://git.cloudron.io/cloudron/letschat-app)
  * [Haste bin](https://git.cloudron.io/cloudron/haste-app)
  * [Pasteboard](https://git.cloudron.io/cloudron/pasteboard-app)
