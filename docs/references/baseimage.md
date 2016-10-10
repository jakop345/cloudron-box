# Overview

The application's Dockerfile must specify the FROM base image to be `cloudron/base:0.9.0`.

The base image already contains most popular software packages including node, nginx, apache,
ruby, PHP. Using the base image greatly reduces the size of app images.

The goal of the base image is simply to provide pre-downloaded software packages. The packages
are not configured in any way and it's up to the application to configure them as they choose.
For example, while `apache` is installed, there are no meaningful site configurations that the
application can use.

# Packages

The following packages are part of the base image. If you need another version, you will have to
install it yourself.

* Apache 2.4.18
* Composer 1.2.0
* Go 1.5.4, 1.6.3
* Gunicorn 19.4.5
* Java 1.8
* Maven 3.3.9
* Mongo 2.6.10
* MySQL Client 5.7.13
* nginx 1.10.0
* Node 0.10.40, 0.12.7, 4.2.6, 4.4.7 (installed under `/usr/local/node-<version>`) [more information](#node-js)
* Perl 5.22.1
* PHP 7.0.8
* Postgresql client 9.5.4
* Python 2.7.12
* Redis 3.0.6
* Ruby 2.3.1
* sqlite3 3.11.0
* Supervisor 3.2.0
* uwsgi 2.0.12

# Inspecting the base image

The base image can be inspected by installing [Docker](https://docs.docker.com/installation/).

Once installed, pull down the base image locally using the following command:
```
    docker pull cloudron/base:0.9.0
```

To inspect the base image:
```
    docker run -ti cloudron/base:0.9.0 /bin/bash
```

*Note:* Please use `docker 1.9.0` or above to pull the base image. Doing otherwise results in a base
image with an incorrect image id. The image id of `cloudron/base:0.9.0` is `d038af182821`.

# The `cloudron` user

The base image contains a user named `cloudron` that apps can use to run their app.

It is good security practice to run apps as a non-previleged user.

# Env vars

The following environment variables are set as part of the application runtime.

## API_ORIGIN

API_ORIGIN is set to the HTTP(S) origin of this Cloudron's API. For example,
`https://my-girish.cloudron.us`.

## APP_DOMAIN

APP_DOMAIN is set to the domain name of the application. For example, `app-girish.cloudron.us`.

## APP_ORIGIN

APP_ORIGIN is set to the HTTP(S) origin on the application. This is origin which the
user can use to reach the application. For example, `https://app-girish.cloudron.us`.

## CLOUDRON

CLOUDRON is always set to '1'. This is useful to write Cloudron specific code.

## WEBADMIN_ORIGIN

WEBADMIN_ORIGIN is set to the HTTP(S) origin of the Cloudron's web admin. For example,
`https://my-girish.cloudron.us`.

# Node.js

The base image comes pre-installed with various node.js versions.

They can be used by adding `ENV PATH /usr/local/node-<version>/bin:$PATH`.

See [Packages](/references/baseimage.html#packages) for available versions.
