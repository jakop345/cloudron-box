# Best practices

## Overview

This document explains the spirit of what makes a Cloudron app.

## No Setup

Cloudron apps do not show a setup screen after installation and should choose reasonable
defaults.

Databases, email configuration should be automatically picked up using [addons](/references/addons.html).

Admin role for the application can be detected dynamically using one of the [authentication](/references/authentication.html)
strategies.

## Image

The Dockerfile contains a specification for building an application image.

  * Install any required software packages in the Dockerfile.

  * Create static configuration files in the Dockerfile.

  * Create symlinks to dynamic configuration files under `/run` in the Dockerfile.

  * Docker supports restarting processes natively. Should your application crash, it will
    be restarted automatically. If your application is a single process, you do not require
    any process manager.

  * The main process must handle `SIGTERM` and forward it as required to child processes. `bash`
    does not automatically forward signals to child processes. For this reason, when using a startup
    shell script, remember to use `exec <app>` as the last line. Doing so will replace bash with your
    program and allows your program to handle signals as required.

  * Use `supervisor`, `pm2` or any of the other process managers if you application has more
    then one component. This excludes web servers like apache, nginx which can already manage their
    children by themselves. Be sure to pick a process manager that forwards signals to child processes.

  * Disable auto updates for apps. Updates must be triggered through the Cloudron Store. This allows the admin
    to manage updates and downtime in a central location (the Cloudron Webadmin).

## File system

The Cloudron runs the application image as read-only. The app can only write to the following directories:

  * `/tmp` - use this for temporary files.

  * `/run` - use this for runtime configration and any dynamic data.

  * `/app/data` - When the `localstorage` addon is enabled, any data under this directory is automatically backed up.

## Logging

Cloudron applications stream their logs to stdout and stderr. In contrast to logging
to files, this approach has many advantages:

  * App does not need to rotate logs and the Cloudron takes care of managing logs
  * App does not need special mechanism to release log file handles (on a log rotate)
  * Integrates better with tooling like `cloudron cli`

This document gives you some recipes for configuring popular libraries to log to stdout. See 
[base image](/references/baseimage.html#configuring) on how to configure various libraries to log to stdout/stderr.


## Memory

By default, applications get 200MB RAM (including swap). This can be changed using the `memoryLimit` field in the manifest.

Design your application runtime for concurrent use by 10s of users. The Cloudron is not designed for concurrent access by
100s or 1000s of users.

## Startup

  * Apps must not present a post-installation screen on first run. It should be already pre-configured for
    a specific purpose.

  * Do not run as `root`. Apps can use the `cloudron` user which is part of the [base image](/references/baseimage.html)
    for this purpose or create their own.

  * When using the `localstorage` addon, the application must change the ownership of files in `/app/data` as desired using `chown`. This
    is necessary because file permissions may not be correctly preserved across backup, restore, application and base image
    updates.

  * Addon information (mail, database) is exposed as environment variables. An application must use these values directly
    and not cache them across restarts. If the variables are stored in a configuration file, then the configuration file
    must be regenerated on every application start. This is usually done using a configuration template that is patched
    on every startup.

## Authentication

Apps should integrate with one of the [authentication strategies](/references/authentication.html).
This saves the user from having to manage separate set of users for different apps.
