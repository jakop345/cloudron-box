# Overview

This tutorial provides an introduction to developing applications
for the Cloudron using node.js.

# Installation

## Install CLI tool

The Cloudron CLI tool allows you to install, configure and test apps on your Cloudron.

Installing the CLI tool requires [node.js](https://nodejs.org/) and
[npm](https://www.npmjs.com/). You can then install the CLI tool using the following
command:

```
    sudo npm install -g cloudron
```

Note: Depending on your setup, you can run the above command without `sudo`.

## Testing your installation

The `cloudron` command should now be available in your path.

Let's login to the Cloudron as follows:

```
$ cloudron login
Cloudron Hostname: craft.selfhost.io

Enter credentials for craft.selfhost.io:
Username: girish
Password:
Login successful.
```

## Your First Application

Creating an application for Cloudron can be summarized as follows:

1. Create a web application using any language/framework. This web application must run a HTTP server
   and can optionally provide other services using custom protocols (like git, ssh, TCP etc).

2. Create a [Dockerfile](http://docs.docker.com/engine/reference/builder/) that specifies how to create 
   an application ```image```. An ```image``` is essentially a bundle of the application source code
   and it's dependencies.

3. Create a [CloudronManifest.json](/references/manifest.html) file that provides essential information
   about the app. This includes information required for the Cloudron Store like title, version, icon and 
   runtime requirements like `addons`.

## Simple Web application

To keep things simple, we will start by deploying a trivial node.js server running on port 8000.

Create a new project folder `tutorial/` and add a file named `tutorial/server.js` with the following content:
```javascript
var http = require("http");

var server = http.createServer(function (request, response) {
  response.writeHead(200, {"Content-Type": "text/plain"});
  response.end("Hello World\n");
});

server.listen(8000);

console.log("Server running at port 8000");
```

## Dockerfile

A Dockerfile contains commands to assemble an image.

Create a file named `tutorial/Dockerfile` with the following content:

```dockerfile
FROM cloudron/base:0.8.1

ADD server.js /app/code/server.js

CMD [ "/usr/local/node-0.12.7/bin/node", "/app/code/server.js" ]
```

The `FROM` command specifies that we want to start off with Cloudron's [base image](/references/baseimage.html).
All Cloudron apps **must** start from this base image.

The `ADD` command copies the source code of the app into the directory `/app/code`.
While this example only copies a single file, the ADD command can be used to copy directory trees as well.
See the [Dockerfile](https://docs.docker.com/reference/builder/#add) documentation for more details.

The `CMD` command specifies how to run the server. There are multiple versions of node available under `/usr/local`. We
choose node v0.12.7 for our app.

## CloudronManifest.json

The `CloudronManifest.json` specifies

* Information about displaying the app on the Cloudron Store. For example,
  the title, author information, description etc

* Information for installing the app on the Cloudron. This includes fields
  like httpPort, tcpPorts.

Create the CloudronManifest.json using the following command:

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
  "author": "John Doe",
  "title": "Tutorial App",
  "description": "App that uses node.js",
  "tagline": "Changing the world one app at a time",
  "version": "0.0.1",
  "healthCheckPath": "/",
  "httpPort": 8000,
  "addons": {
    "localstorage": {}
  },
  "minBoxVersion": "0.0.1",
  "manifestVersion": 1,
  "website": "https://cloudron.io",
  "contactEmail": "support@cloudron.io",
  "icon": "",
  "mediaLinks": []
}
```

You can read in more detail about each field in the [Manifest reference](/references/manifest.html).

# Installing

## Building

We now have all the necessary files in place to build and deploy the app to the Cloudron.
Building creates an image of the app using the Dockerfile which can then be used to deploy
to the Cloudron.

Building, pushing and pulling docker images is very bandwidth and CPU intensive. To alleviate this
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

Build scheduled with id 76cebfdd-7822-4f3d-af17-b3eb393ae604
Downloading source
Building
Step 0 : FROM cloudron/base:0.8.1
 ---> 97583855cc0c
Step 1 : ADD server.js /app/code
 ---> b09b97ecdfbc
Removing intermediate container 03c1e1f77acb
Step 2 : CMD /usr/local/node-0.12.7/bin/node /app/code/main.js
 ---> Running in 370f59d87ab2
 ---> 53b51eabcb89
Removing intermediate container 370f59d87ab2
Successfully built 53b51eabcb89
The push refers to a repository [cloudron/img-2074d69134a7e0da3d6cdf3c53e241c4] (len: 1)
Sending image list
Pushing repository cloudron/img-2074d69134a7e0da3d6cdf3c53e241c4 (1 tags)
Image already pushed, skipping 57f52d167bbb
Image successfully pushed b09b97ecdfbc
Image successfully pushed 53b51eabcb89
Pushing tag for rev [53b51eabcb89] on {https://cdn-registry-1.docker.io/v1/repositories/cloudron/img-2074d69134a7e0da3d6cdf3c53e241c4/tags/76cebfdd-7822-4f3d-af17-b3eb393ae604}
Build succeeded
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

This makes the app available at https://tutorial-craft.selfhost.io.

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
2015-05-08T03:28:40.233940616Z Server running at port 8000
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

# Storing data

For file system storage, an app can use the `localstorage` addon to store data under `/app/data`.
When the `localstorage` addon is active, any data under /app/data is automatically backed up. When an
app is updated, /app/data already contains the data generated by the previous version.

*Note*: For convenience, the initial CloudronManifest.json generated by `cloudron init` already contains this
addon.

Let us put this theory into action by saving a *visit counter* as a file.
*server.js* has been modified to count the number of visitors on the site by storing a counter
in a file named ```counter.dat```.

File ```tutorial/server.js```

```javascript
var http = require('http'),
    fs = require('fs'),
    util = require('util');

var COUNTER_FILE = '/app/data/counter.dat';

var server = http.createServer(function (request, response) {
    var counter = 0;
    if (fs.existsSync(COUNTER_FILE)) {
        // read existing counter if it exists
        counter = parseInt(fs.readFileSync(COUNTER_FILE, 'utf8'), 10);
    }

    response.writeHead(200, {"Content-Type": "text/plain"});
    response.end(util.format("Hello World. %s visitors have visited this page\n", counter));
    ++counter; // bump the counter
    fs.writeFileSync(COUNTER_FILE, counter + '', 'utf8'); // save back counter
});

server.listen(8000);

console.log("Server running at port 8000");
```

Now every time you refresh the page you will notice that the counter bumps up. You will
also notice that if you make changes to the app and do a `cloudron install`, the `counter.dat`
is *retained* across updates.

# Database

Most web applications require a database of some form. In theory, it is possible to run any
database you want as part of the application image. This is, however, a waste of server resources
should every app runs it's own database server.

To solve this, the Cloudron provides shareable resources like databases in form of ```addons```.
The database server is managed by the Cloudron and the application simply needs to request access to
the database in the CloudronManifest.json. While the database server itself is a shared resource, the
databases are exclusive to the application. Each database is password protected and accessible only
to the application. Databases and tables can be configured without restriction as the application
requires.

Cloudron currently provides `mysql`, `postgresql`, `mongodb`, `redis` database addons.

For this tutorial, let us try to save the counter in `redis` addon. For this, we make use of the
[redis](https://www.npmjs.com/package/redis) module.

Since this is a node.js app, let's add a very basic `package.json` containing the `redis` module dependency.

File `tutorial/package.json`
```json
{
  "name": "tutorial",
  "version": "1.0.0",
  "dependencies": {
    "redis": "^0.12.1"
  }
}
```

and modify our Dockerfile to look like this:

File `tutorial/Dockerfile`

```dockerfile
FROM cloudron/base:0.8.1

ADD server.js /app/code/server.js
ADD package.json /app/code/package.json

WORKDIR /app/code
RUN npm install --production

CMD [ "/usr/local/node-0.12.7/bin/node", "/app/code/server.js" ]
```

Notice the new `RUN` command which installs the node module dependencies in package.json using `npm install`.

Since we want to use redis, we have to modify the CloudronManifest.json to make redis available for this app.

File `tutorial/CloudronManifest.json`

```json
{
  "id": "io.cloudron.tutorial",
  "author": "John Doe",
  "title": "Tutorial App",
  "description": "App that uses node.js",
  "tagline": "Changing the world one app at a time",
  "version": "0.0.1",
  "healthCheckPath": "/",
  "httpPort": 8000,
  "addons": {
    "localstorage": {},
    "redis": {}
  },
  "minBoxVersion": "0.0.1",
  "manifestVersion": 1,
  "website": "https://cloudron.io",
  "contactEmail": "support@cloudron.io",
  "icon": "",
  "mediaLinks": []
}
```

When the application runs, environment variables `REDIS_HOST`, `REDIS_PORT` and
`REDIS_PASSWORD` are injected. You can read about the environment variables in the
[Redis reference](/references/addons.html#redis).

Let's change `server.js` to use redis instead of file backed counting:

File ```tutorial/server.js```

```javascript
var http = require('http'),
    fs = require('fs'),
    util = require('util'),
    redis = require('redis');

var redisClient = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_HOST);
redisClient.auth(process.env.REDIS_PASSWORD);
redisClient.on("error", function (err) {
  console.log("Redis Client Error " + err);
});

var COUNTER_KEY = 'counter';

var server = http.createServer(function (request, response) {
  redisClient.get(COUNTER_KEY, function (err, reply) {
    var counter = (!err && reply) ? parseInt(reply, 10) : 0;
    response.writeHead(200, {"Content-Type": "text/plain"});
    response.end(util.format("Hello World. %s visitors have visited this page\n", counter));
    redisClient.incr(COUNTER_KEY);
  });
});

server.listen(8000);

console.log("Server running at port 8000");
```

Simply `cloudron build` and `cloudron install` to test your app!

# Authentication

The Cloudron has a centralized panel for managing users and groups. Apps can integrate Single Sign-On
authentication using LDAP or OAuth.

Note that apps that are single user can skip Single Sign-On support. The Cloudron implements an `OAuth
proxy` (accessed through the app configuration dialog) that optionally lets the Cloudron admin make the
app visible only for logged in users.

## LDAP

Let's start out by adding the [ldap](/references/addons.html#ldap) addon to the manifest.

File `tutorial/CloudronManifest.json`
```json
{
  "id": "io.cloudron.tutorial",
  "author": "John Doe",
  "title": "Tutorial App",
  "description": "App that uses node.js",
  "tagline": "Changing the world one app at a time",
  "version": "0.0.1",
  "healthCheckPath": "/",
  "httpPort": 8000,
  "addons": {
    "localstorage": {},
    "ldap": {}
  },
  "minBoxVersion": "0.0.1",
  "manifestVersion": 1,
  "website": "https://cloudron.io",
  "contactEmail": "support@cloudron.io",
  "icon": "",
  "mediaLinks": []
}
```

Building and installing the app shows that the app gets new LDAP specific environment variables.

```
$ cloudron build
$ cloudron install
$ cloudron exec env | grep LDAP
LDAP_SERVER=172.17.42.1
LDAP_PORT=3002
LDAP_URL=ldap://172.17.42.1:3002
LDAP_USERS_BASE_DN=ou=users,dc=cloudron
LDAP_GROUPS_BASE_DN=ou=groups,dc=cloudron
```

Let's test the environment variables to use by using the [ldapjs](http://www.ldapjs.org) npm module.
We start by adding ldapjs to package.json.

File `tutorial/package.json`
```json
{
  "name": "tutorial",
  "version": "1.0.0",
  "dependencies": {
    "ldapjs": "^0.7.1"
  }
}
```

The server code has been modified to authenticate using the `X-Username` and `X-Password` headers for
any path other than '/'.

File `tutorial/server.js`
```javascript
var http = require("http"),
    ldap = require('ldapjs');

var ldapClient = ldap.createClient({ url: process.env.LDAP_URL });

var server = http.createServer(function (request, response) {
  if (request.url === '/') {
    response.writeHead(200, {"Content-Type": "text/plain"});
    return response.end();
  }

  var username = request.headers['x-username'] || '';
  var password = request.headers['x-password'] || '';
  var ldapDn = 'cn=' + username + ',' + process.env.LDAP_USERS_BASE_DN;

  ldapClient.bind(ldapDn, password, function (error) {
    if (error) {
      response.writeHead(401, {"Content-Type": "text/plain"});
      response.end('Failed to authenticate: ' + error);
    } else {
      response.writeHead(200, {"Content-Type": "text/plain"});
      response.end('Successfully authenticated');
    }
  });
});

server.listen(8000);

console.log("Server running at port 8000");
```

Once we have used `cloudron build` and `cloudron install`, you can use `curl` to test
credentials as follows:

```bash
  # Test with various credentials here. Your cloudon admin username and password should succeed.
  curl -X 'X-Username: admin' -X 'X-Password: pass' https://tutorial-craft.selfhost.io/login
```

## OAuth

An app can integrate with OAuth 2.0 Authorization code grant flow by adding
[oauth](/references/addons.html#oauth) to CloudronManifest.json `addons` section.

Doing so will get the following environment variables:
```
$ cloudron exec env
OAUTH_CLIENT_ID=cid-addon-4089f65a-2adb-49d2-a6d1-e519b7d85e8d
OAUTH_CLIENT_SECRET=5af99a9633283aa15f5e6df4a108ff57f82064e4845de8bce8ad3af54dfa9dda
OAUTH_ORIGIN=https://my-craft.selfhost.io
API_ORIGIN=https://my-craft.selfhost.io
HOSTNAME=tutorial-craft.selfhost.io
```

OAuth Authorization code grant flow works as follows:
* App starts the flow by redirecting the user to Cloudron authorization endpoint of the following format:
```
https://API_ORIGIN/api/v1/oauth/dialog/authorize?response_type=code&client_id=OAUTH_CLIENT_ID&redirect_uri=CALLBACK_URL&scope=profile
```

  In the above URL, API_ORIGIN and OAUTH_CLIENT_ID are environment variables. CALLBACK_URL is a url of the app
to which the user will be redirected back to after successful authentication. CALLBACK_URL has to have the
same origin as the app.

* The Cloudron OAuth server authenticates the user (using a password form) at the above URL. It also establishes
that the user grants the client's access request.

* If the user authenticated successfully, it will redirect the browser to CALLBACK_URL with a `code` query parameter.

* The app can exchange the `code` above for a `access token` by using the `OAUTH_CLIENT_SECRET`. It does so by making
  a _POST_ request to the following url:
```
https://API_ORIGIN/api/v1/oauth/token?response_type=token&client_id=OAUTH_CLIENT_ID
```
with the following request body (json):
```json
{
    "grant_type": "authorization_code",
    "code": "<the code received in CALLBACK_URL query parameter>",
    "redirect_uri": "https://<HOSTNAME>",
    "client_id": "<OAUTH_CLIENT_ID>",
    "client_secret": "<OAUTH_CLIENT_SECRET>"
}
```

  In the above URL, API_ORIGIN, OAUTH_CLIENT_ID and HOSTNAME are environment variables. The response contains
the `access_token` in the body.

* The `access_token` can be used to get the [user's profile](/references/api.html#profile) using the following url:
```
https://API_ORIGIN/api/v1/profile?access_token=ACCESS_TOKEN
```

  The `access_token` may also be provided in the `Authorization` header as `Bearer: <token>`.

An implementation of the above OAuth logic is at [ircd-app](https://github.com/cloudron-io/ircd-app/blob/master/settings/app.js).

The following libraries implement Cloudron OAuth for Ruby and Javascript.

 * [omniauth-cloudron](https://github.com/cloudron-io/omniauth-cloudron)
 * [passport-cloudron](https://github.com/cloudron-io/passport-cloudron)

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
`cloudron install --appstore-id <appid@version>`. Note that this currently
requires your beta testers to install the CLI tool and put their Cloudron in
developer mode.

# Publishing

Once you are satisfied with the beta testing, you can submit it for review.

```
  cloudron submit
```

The cloudron.io team will review the app and publish the app to the store.

# Next steps

Congratulations! You are now well equipped to build web applications for the Cloudron.

# Samples

  * [Lets Chat](https://github.com/cloudron-io/letschat-app)
  * [Haste bin](https://github.com/cloudron-io/haste-app)
  * [Pasteboard](https://github.com/cloudron-io/pasteboard-app)
