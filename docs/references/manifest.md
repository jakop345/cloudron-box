# CloudronManifest

## Overview

Every Cloudron Application contains a `CloudronManifest.json`.

The manifest contains two categories of information:

* Information about displaying the app on the Cloudron Store. For example,
  the title, author information, description etc

* Information for installing the app on the Cloudron. This includes fields
  like httpPort, tcpPorts.

A CloudronManifest.json can **only** contain fields that are listed as part of this
specification. The Cloudron Store and the Cloudron *may* reject applications that have
extra fields.

Here is an example manifest:

```
{
  "id": "com.example.test",
  "title": "Example Application",
  "author": "Girish Ramakrishnan <girish@cloudron.io>",
  "description": "This is an example app",
  "tagline": "A great beginning",
  "version": "0.0.1",
  "healthCheckPath": "/",
  "httpPort": 8000,
  "addons": {
    "localstorage": {}
  },
  "manifestVersion": 1,
  "website": "https://www.example.com",
  "contactEmail": "support@clourdon.io",
  "icon": "file://icon.png",
  "tags": [ "test", "collaboration" ],
  "mediaLinks": [ "www.youtube.com/watch?v=dQw4w9WgXcQ" ]
}
```

## Fields

### addons

Type: object

Required: no

Allowed keys
* [ldap](addons.html#ldap)
* [localstorage](addons.html#localstorage)
* [mongodb](addons.html#mongodb)
* [mysql](addons.html#mysql)
* [oauth](addons.html#oauth)
* [postgresql](addons.html#postgresql)
* [redis](addons.html#redis)
* [sendmail](addons.html#sendmail)

The `addons` object lists all the [addons](addons.html) and the addon configuration used by the application.

Example:
```
  "addons": {
    "localstorage": {},
    "mongodb": {}
  }
```

### author

Type: string

Required: yes

The `author` field contains the name and email of the app developer (or company).

Example:
```
  "author": "Cloudron Inc <girish@cloudron.io>"
```

### changelog

Type: markdown string

Required: no

The `changelog` field contains the changes in this version of the application. This string
can be a markdown style bulleted list.

Example:
```
  "changelog": "* Add support for IE8 \n* New logo"
```

### configurePath

Type: path string

Required: no

The `configurePath` can be used to specify the absolute path to the configuration / settings
page of the app. When this path is present, an absoluted URL is constructed from the app's
install location this path and presented to the user in the configuration dialog of the app.

This is useful for apps that have a main page which does not display a configuration / settings
url (i.e) it's hidden for aesthetic reasons. For example, a blogging app like wordpress might
keep the admin page url hidden in the main page. Setting the configurationPath makes the
configuration url discoverable by the user.

Example:
```
  "configurePath": "/wp-admin"
```

### contactEmail

Type: email

Required: yes

The `contactEmail` field contains the email address that Cloudron users can contact for any
bug reports and suggestions.

Example:
```
  "contactEmail": "support@testapp.com"
```

### description

Type: markdown string

Required: yes

The `description` field contains a detailed description of the app. This information is shown
to the user when they install the app from the Cloudron Store.

Example:
```
  "description": "This is a detailed description of this app."
```

A large `description` can be unweildy to manage and edit inside the CloudronManifest.json. For
this reason, the `description` can also contain a file reference. The Cloudron CLI tool fills up
the description from this file when publishing your application.

Example:
```
  "description:": "file://DESCRIPTION.md"
```

### developmentMode

Type: boolean

Required: no

Setting `developmentMode` to true disables readonly rootfs and the default memory limit. In addition,
the application *pauses* on start and can be started manually using `cloudron exec`.  Note that you
cannot submit an app to the store with this field turned on.

This mode can be used to identify the files being modified by your application - often required to
debug situations where your app does not run on a readonly rootfs. Run your app using `cloudron exec`
and use `find / -mmin -30` to find file that have been changed or created in the last 30 minutes.

### healthCheckPath

Type: url path

Required: yes

The `healthCheckPath` field is used by the Cloudron Runtime to determine if your app is running and
responsive. The app must return a 2xx HTTP status code as a response when this path is queried. In
most cases, the default "/" will suffice but there might be cases where periodically querying "/"
is an expensive operation. In addition, the app might want to use a specialized route should it
want to perform some specialized internal checks.

Example:
```
  "healthCheckPath": "/"
```
### httpPort

Type: positive integer

Required: yes

The `httpPort` field contains the TCP port on which your app is listening for HTTP requests. This port
is exposed to the world via subdomain/location that the user chooses at installation time. While not
required, it is good practice to mark this port as `EXPOSE` in the Dockerfile.

Cloudron Apps are containerized and thus two applications can listen on the same port. In reality,
they are in different network namespaces and do not conflict with each other.

Note that this port has to be HTTP and not HTTPS or any other non-HTTP protocol. HTTPS proxying is
handled by the Cloudron platform (since it owns the certificates).

Example:
```
  "httpPort": 8080
```

### icon

Type: local image filename

Required: no

The `icon` field is used to display the application icon/logo in the Cloudron Store. Icons are expected
to be square of size 256x256.

```
  "icon": "file://icon.png"
```

### id

Type: reverse domain string

Required: yes

The `id` is a unique human friendly Cloudron Store id. This is similar to reverse domain string names used
as java package names. The convention is to base the `id` based on a domain that you own.

The Cloudron tooling allows you to build applications with any `id`. However, you will be unable to publish
the application if the id is already in use by another application.

```
  "id": "io.cloudron.testapp"
```

### manifestVersion

Type: integer

Required: yes

`manifestVersion` specifies the version of the manifest and is always set to 1.

```
  "manifestVersion": 1
```

### mediaLinks

Type: array of urls

Required: no

The `mediaLinks` field contains an array of links that the Cloudron Store uses to display a slide show of pictures
and videos of the application.

All links are preferably https.

```
  "mediaLinks": [
    "www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://images.rapgenius.com/fd0175ef780e2feefb30055be9f2e022.520x343x1.jpg"
  ]
```

### memoryLimit

Type: bytes (integer)

Required: no

The `memoryLimit` field is the maximum amount of memory (including swap) in bytes an app is allowed to consume before it
gets killed and restarted.

By default, all apps have a memoryLimit of 200MB. For example, to have a limit of 500MB,

```
  "memoryLimit": 524288000
```

### maxBoxVersion

Type: semver string

Required: no

The `maxBoxVersion` field is the maximum box version that the app can possibly run on. Attempting to install the app on
a box greater than `maxBoxVersion` will fail.

This is useful when a new box release introduces features which are incompatible with the app. This situation is quite
unlikely and it is recommended to leave this unset.

### minBoxVersion

Type: semver string

Required: no

The `minBoxVersion` field is the minimum box version that the app can possibly run on. Attempting to install the app on
a box lesser than `minBoxVersion` will fail.

This is useful when the app relies on features that are only available from a certain version of the box. If unset, the
default value is `0.0.1`.

### singleUser

Type: boolean

Required: no

The `singleUser` field can be set to true for apps that are meant to be used only a single user.

When set, the Cloudron will display a user selection dialog at installation time. The selected user is the sole user
who can access the app.

### tagline

Type: one-line string

Required: no

The `tagline` is used by the Cloudron Store to display a single line short description of the application.

```
  "tagline": "The very best note keeper"
```

### tags

Type: Array of strings

Required: no

The `tags` are used by the Cloudron Store for filtering searches by keyword.

```
  "tags": [ "git", "version control", "scm" ]
```

### targetBoxVersion

Type: semver string

Required: no

The `targetBoxVersion` field is the box version that the app was tested on. By definition, this version has to be greater
than the `minBoxVersion`.

The box uses this value to enable compatibility behavior of APIs. For example, an app sets the targetBoxVersion to 0.0.5
and is published on the store. Later, box version 0.0.10 introduces a new feature that conflicts with how apps used
to run in 0.0.5 (say SELinux was enabled for apps). When the box runs such an app, it ensures compatible behavior
and will disable the SELinux feature for the app.

If unspecified, this value defaults to `minBoxVersion`.

### tcpPorts

Type: object

Required: no

Syntax: Each key is the environment variable. Each value is an object containing `title`, `description` and `defaultValue`.
An optional `containerPort` may be specified.

The `tcpPorts` field provides information on the non-http TCP ports/services that your application is listening on. During
installation, the user can decide how these ports are exposed from their Cloudron.

For example, if the application runs an SSH server at port 29418, this information is listed here. At installation time,
the user can decide any of the following:
* Expose the port with the suggested `defaultValue` to the outside world. This will only work if no other app is being exposed at same port.
* Provide an alternate value on which the port is to be exposed to outside world.
* Disable the port/service.

To illustrate, the application lists the ports as below:
```
  "tcpPorts": {
    "SSH_PORT": {
      "title": "SSH Port",
      "description": "SSH Port over which repos can be pushed & pulled",
      "defaultValue": 29418,
      "containerPort": 22
    }
  },
```

In the above example:
* `SSH_PORT` is an app specific environment variable. Only strings, numbers and _ (underscore) are allowed. The author has to ensure that they don't clash with platform profided variable names.

* `title` is a short one line information about this port/service.

* `description` is a multi line description about this port/service.

* `defaultValue` is the recommended port value to be shown in the app installation UI.

* `containerPort` is the port that the app is listening on (recall that each app has it's own networking namespace).

In more detail:

* If the user decides to disable the SSH service, this environment variable `SSH_PORT` is absent. Applications _must_ detect this on
  start up and disable these services.

* `SSH_PORT` is set to the value of the exposed port. Should the user choose to expose the SSH server on port 6000, then the
  value of SSH_PORT is 6000.

* `defaultValue` is **only** used for display purposes in the app installation UI.  This value is independent of the value
   that the app is listening on. For example, the app can run an SSH server at port 22 but still recommend a value of 29418 to the user.

* `containerPort` is the port that the app is listening on. The Cloudron runtime will _bridge_ the user chosen external port
  with the app specific `containerPort`. Cloudron Apps are containerized and each app has it's own networking namespace.
  As a result, different apps can have the same `containerPort` value because these values are namespaced.

* The environment variable `SSH_PORT` may be used by the app to display external URLs. For example, the app might want to display
  the SSH URL. In such a case, it would be incorrect to use the `containerPort` 22 or the `defaultValue` 29418 since this is not
  the value chosen by the user.

* `containerPort` is optional and can be omitted, in which case the bridged port numbers are the same internally and externally.
  Some apps use the same variable (in their code) for listen port and user visible display strings. When packaging these apps,
  it might be simpler to listen on `SSH_PORT` internally. In such cases, the app can omit the `containerPort` value and should
  instead reconfigure itself to listen internally on `SSH_PORT` on each start up.

### title

Type: string

Required: yes

The `title` is the primary application title displayed on the Cloudron Store.

Example:
```
  "title": "Gitlab"
```

### version

Type: semver string

Required: yes

The `version` field specifies a [semver](http://semver.org/) string. The version is used by the Cloudron to compare versions and to
determine if an update is available.

Example:
```
  "version": "1.1.0"
```

### website

Type: url

Required: yes

The `website` field is a URL where the user can read more about the application.

Example:
```
  "website": "https://example.com/myapp"
```
