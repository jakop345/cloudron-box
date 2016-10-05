# Addons

## Overview

Addons are services like database, authentication, email, caching that are part of the
Cloudron runtime. Setup, provisioning, scaling and maintanence of addons is taken care of
by the runtime.

The fundamental idea behind addons is to allow sharing of Cloudron resources across applications.
For example, a single MySQL server instance can be used across multiple apps. The Cloudron
runtime sets up addons in such a way that apps are isolated from each other.

## Using Addons

Addons are opt-in and must be specified in the [Cloudron Manifest](/references/manifest.html).
When the app runs, environment variables contain the necessary information to access the addon.
For example, the mysql addon sets the `MYSQL_URL` environment variable which is the
connection string that can be used to connect to the database.

When working with addons, developers need to remember the following:
* Environment variables are subject to change every time the app restarts. This can happen if the
Cloudron is rebooted or restored or the app crashes or an addon is re-provisioned. For this reason,
applications must never cache the value of environment variables across restarts.

* Addons must be setup or updated on each application start up. Most applications use DB migration frameworks
for this purpose to setup and update the DB schema.

* Addons are configured in the [addons section](/references/manifest.html#addons) of the manifest as below:
```
    {
      ...
      "addons": {
        "oauth": { },
        "redis" : { }
      }
    }
```

## All addons

### email

This addon allows an app to send and recieve emails on behalf of the user. The intended use case is webmail applications.

If an app wants to send mail (e.g notifications), it must use the [sendmail](/references/addons#sendmail)
addon. If the app wants to receive email (e.g user replying to notification), it must use the
[recvmail](/references/addons#recvmail) addon instead.

Apps using the IMAP and ManageSieve services below must be prepared to accept self-signed certificates (this is not a problem
because these are addresses internal to the Cloudron).

Exported environment variables:
```
MAIL_SMTP_SERVER=       # SMTP server IP or hostname. Supports STARTTLS (TLS upgrade is enforced).
MAIL_SMTP_PORT=         # SMTP server port
MAIL_IMAP_SERVER=       # IMAP server IP or hostname. TLS required.
MAIL_IMAP_PORT=         # IMAP server port
MAIL_SIEVE_SERVER=      # ManageSieve server IP or hostname. TLS required.
MAIL_SIEVE_PORT=        # ManageSieve server port
MAIL_DOMAIN=            # Domain of the mail server
```

### ldap

This addon provides LDAP based authentication via LDAP version 3.

Exported environment variables:
```
LDAP_SERVER=                                # ldap server IP
LDAP_PORT=                                  # ldap server port
LDAP_URL=                                   # ldap url of the form ldap://ip:port
LDAP_USERS_BASE_DN=                         # ldap users base dn of the form ou=users,dc=cloudron
LDAP_GROUPS_BASE_DN=                        # ldap groups base dn of the form ou=groups,dc=cloudron
LDAP_BIND_DN=                               # DN to perform LDAP requests
LDAP_BIND_PASSWORD=                         # Password to perform LDAP requests
```

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `ldapsearch` client within the context of the app:
```
cloudron exec

# list users
> ldapsearch -x -h "${LDAP_SERVER}" -p "${LDAP_PORT}" -b  "${LDAP_USERS_BASE_DN}"

# list users with authentication (Substitute username and password below)
> ldapsearch -x -D cn=<username>,${LDAP_USERS_BASE_DN} -w <password> -h "${LDAP_SERVER}" -p "${LDAP_PORT}" -b  "${LDAP_USERS_BASE_DN}"

# list admins
> ldapsearch -x -h "${LDAP_SERVER}" -p "${LDAP_PORT}" -b  "${LDAP_USERS_BASE_DN}" "memberof=cn=admins,${LDAP_GROUPS_BASE_DN}"

# list groups
> ldapsearch -x -h "${LDAP_SERVER}" -p "${LDAP_PORT}" -b  "${LDAP_GROUPS_BASE_DN}"
```

### localstorage

Since all Cloudron apps run within a read-only filesystem, this addon provides a writeable folder under `/app/data/`.
All contents in that folder are included in the backup. On first run, this folder will be empty. File added in this path
as part of the app's image (Dockerfile) won't be present. A common pattern is to create the directory structure required
the app as part of the app's startup script.

The permissions and ownership of data within that directory are not guranteed to be preserved. For this reason, each app
has to restore permissions as required by the app as part of the app's startup script.

If the app is running under the recommeneded `cloudron` user, this can be achieved with:
```
chown -R cloudron:cloudron /app/data
```

### mongodb

By default, this addon provide mongodb 2.6.3.

Exported environment variables:
```
MONGODB_URL=          # mongodb url
MONGODB_USERNAME=     # username
MONGODB_PASSWORD=     # password
MONGODB_HOST=         # server IP/hostname
MONGODB_PORT=         # server port
MONGODB_DATABASE=     # database name
```

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `mongo` shell within the context of the app:
```
cloudron exec

# mongo -u "${MONGODB_USERNAME}" -p "${MONGODB_PASSWORD}" ${MONGODB_HOST}:${MONGODB_PORT}/${MONGODB_DATABASE}

```
### mysql

By default, this addon provides a single database on MySQL 5.6.19. The database is already created and the application
only needs to create the tables.

Exported environment variables:
```
MYSQL_URL=            # the mysql url (only set when using a single database, see below)
MYSQL_USERNAME=       # username
MYSQL_PASSWORD=       # password
MYSQL_HOST=           # server IP/hostname
MYSQL_PORT=           # server port
MYSQL_DATABASE=       # database name (only set when using a single database, see below)
```

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `mysql` client within the context of the app:
```
cloudron exec

> mysql --user=${MYSQL_USERNAME} --password=${MYSQL_PASSWORD} --host=${MYSQL_HOST} ${MYSQL_DATABASE}

```

The `multipleDatabases` option can be set to `true` if the app requires more than one database. When enabled,
the following environment variables are injected:

```
MYSQL_DATABASE_PREFIX=      # prefix to use to create databases
```

### oauth

The Cloudron OAuth 2.0 provider can be used in an app to implement Single Sign-On.

Exported environment variables:
```
OAUTH_CLIENT_ID=      # client id
OAUTH_CLIENT_SECRET=  # client secret
```

The callback url required for the OAuth transaction can be contructed from the environment variables below:

```
APP_DOMAIN=           # hostname of the app
APP_ORIGIN=           # origin of the app of the form https://domain
API_ORIGIN=      # origin of the OAuth provider of the form https://my-cloudrondomain
```

OAuth2 URLs can be constructed as follows:

```
AuthorizationURL = ${API_ORIGIN}/api/v1/oauth/dialog/authorize # see above for API_ORIGIN
TokenURL = ${API_ORIGIN}/api/v1/oauth/token
```

The token obtained via OAuth has a restricted scope wherein they can only access the [profile API](/references/api.html#profile). This restriction
is so that apps cannot make undesired changes to the user's Cloudron.

We currently provide OAuth2 integration for Ruby [omniauth](https://github.com/cloudron-io/omniauth-cloudron) and Node.js [passport](https://github.com/cloudron-io/passport-cloudron).

### postgresql

By default, this addon provides PostgreSQL 9.4.4.

Exported environment variables:
```
POSTGRESQL_URL=       # the postgresql url
POSTGRESQL_USERNAME=  # username
POSTGRESQL_PASSWORD=  # password
POSTGRESQL_HOST=      # server name
POSTGRESQL_PORT=      # server port
POSTGRESQL_DATABASE=  # database name
```

The postgresql addon whitelists the hstore and pg_trgm extensions to be installable by the database owner.

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `psql` client within the context of the app:
```
cloudron exec

> PGPASSWORD=${POSTGRESQL_PASSWORD} psql -h ${POSTGRESQL_HOST} -p ${POSTGRESQL_PORT} -U ${POSTGRESQL_USERNAME} -d ${POSTGRESQL_DATABASE}
```

### recvmail

The recvmail addon can be used to receive email for the application.

Exported environment variables:
```
MAIL_IMAP_SERVER=     # the IMAP server. this can be an IP or DNS name
MAIL_IMAP_PORT=       # the IMAP server port
MAIL_IMAP_USERNAME=   # the username to use for authentication
MAIL_IMAP_PASSWORD=   # the password to use for authentication
MAIL_TO=              # the "To" address to use
MAIL_DOMAIN=          # the mail for which email will be received
```

The IMAP server only accepts TLS connections. The app must be prepared to accept self-signed certs (this is not a problem because the
imap address is internal to the Cloudron).

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `openssl` tool within the context of the app:
```
cloudron exec

> openssl s_client -connect "${MAIL_IMAP_SERVER}:${MAIL_IMAP_PORT}" -crlf
```

The IMAP command `? LOGIN username password` can then be used to test the authentication.

### redis

By default, this addon provides redis 2.8.13. The redis is configured to be persistent and data is preserved across updates
and restarts.

Exported environment variables:
```
REDIS_URL=            # the redis url
REDIS_HOST=           # server name
REDIS_PORT=           # server port
REDIS_PASSWORD=       # password
```

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `redis-cli` client within the context of the app:
```
cloudron exec

> redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -a "${REDIS_PASSWORD}"
```

### scheduler

The scheduler addon can be used to run tasks at periodic intervals (cron).

Scheduler can be configured as below:
```
    "scheduler": {
        "update_feeds": {
            "schedule": "*/5 * * * *",
            "command": "/app/code/update_feed.sh"
        }
    }
```

In the above example, `update_feeds` is the name of the task and is an arbitrary string.

`schedule` values must fall within the following ranges:

 * Minutes: 0-59
 * Hours: 0-23
 * Day of Month: 1-31
 * Months: 0-11
 * Day of Week: 0-6

_NOTE_: scheduler does not support seconds

`schedule` supports ranges (like standard cron):

 * Asterisk. E.g. *
 * Ranges. E.g. 1-3,5
 * Steps. E.g. */2

`command` is executed through a shell (sh -c). The command runs in the same launch environment
as the application. Environment variables, volumes (`/tmp` and `/run`) are all
shared with the main application.

If a task is still running when a new instance of the task is scheduled to be started, the previous
task instance is killed.


### sendmail

The sendmail addon can be used to send email from the application.

Exported environment variables:
```
MAIL_SMTP_SERVER=     # the mail server (relay) that apps can use. this can be an IP or DNS name
MAIL_SMTP_PORT=       # the mail server port
MAIL_SMTP_USERNAME=   # the username to use for authentication as well as the `from` username when sending emails
MAIL_SMTP_PASSWORD=   # the password to use for authentication
MAIL_FROM=            # the "From" address to use
MAIL_DOMAIN=          # the domain name to use for email sending (i.e username@domain)
```

The SMTP server does not require STARTTLS. If STARTTLS is used, the app must be prepared to accept self-signed certs.

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `swaks` tool within the context of the app:
```
cloudron exec

> swaks --server "${MAIL_SMTP_SERVER}" -p "${MAIL_SMTP_PORT}" --from "${MAIL_SMTP_USERNAME}@${MAIL_DOMAIN}" --body "Test mail from cloudron app at $(hostname -f)" --auth-user "${MAIL_SMTP_USERNAME}" --auth-password "${MAIL_SMTP_PASSWORD}"
```

### simpleauth

Simple Auth can be used for authenticating users with a HTTP request. This method of authentication is targeted
at applications, which for whatever reason can't use the ldap addon.
The response contains an `accessToken` which can then be used to access the [Cloudron API](/references/api.html).

Exported environment variables:
```
SIMPLE_AUTH_SERVER=    # the simple auth HTTP server
SIMPLE_AUTH_PORT=      # the simple auth server port
SIMPLE_AUTH_URL=       # the simple auth server URL. same as "http://SIMPLE_AUTH_SERVER:SIMPLE_AUTH_PORT
SIMPLE_AUTH_CLIENT_ID  # a client id for identifying the request originator with the auth server
```

This addons provides two REST APIs:

**POST /api/v1/login**

Request JSON body:
```
{
  "username": "<username> or <email>",
  "password": "<password>"
}
```

Response 200 with JSON body:
```
{
  "accessToken": "<accessToken>",
  "user": {
    "id": "<userId>",
    "username": "<username>",
    "email": "<email>",
    "admin": <admin boolean>,
    "displayName": "<display name>"
  }
}
```

**GET /api/v1/logout**

Request params:
```
?access_token=<accessToken>
```

Response 200 with JSON body:
```
{}
```

For debugging, [cloudron exec](https://www.npmjs.com/package/cloudron) can be used to run the `curl` tool within the context of the app:
```
cloudron exec

> USERNAME=<enter username>

> PASSWORD=<enter password>

> PAYLOAD="{\"clientId\":\"${SIMPLE_AUTH_CLIENT_ID}\", \"username\":\"${USERNAME}\", \"password\":\"${PASSWORD}\"}"

> curl -H "Content-Type: application/json" -X POST -d "${PAYLOAD}" "${SIMPLE_AUTH_ORIGIN}/api/v1/login"
```
