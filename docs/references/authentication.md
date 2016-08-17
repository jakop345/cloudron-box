# Authentication

## Overview

Cloudron provides a centralized dashboard to manage users, roles and permissions. Applications
do not create or manage user credentials on their own and instead use one of the various
authentication strategies provided by the Cloudron.

Note that authentication only identifies a user and does not indicate if the user is authorized
to perform an action in the application. Authorizing users is application specific and must be
implemented by the application.

## Users & Admins

Cloudron user management is intentionally very simple. The owner (first user) of the
Cloudron is `admin` by default. The `admin` role allows one to install, uninstall and reconfigure
applications on the Cloudron.

A Cloudron `admin` can create one or more users. Cloudron users can login and use any of the installed
apps in the Cloudron. In general, adding a cloudron user is akin to adding a person from one's family
or organization or team because such users gain access to all apps in the Cloudron. Removing a user
immediately revokes access from all apps.

A Cloudron `admin` can give admin privileges to one or more Cloudron users.

Each Cloudron user has an unique `username` and an `email`.

## Strategies

Cloudron provides multiple authentication strategies.

* OAuth 2.0 provided by the [OAuth addon](/references/addons.html#oauth)
* LDAP provided by the [LDAP addon](/references/addons.html#ldap)
* Simple Auth provided by [Simple Auth addon](/references/addons.html#simpleauth)

## Choosing a strategy

Applications can be broadly categorized based on their user management as follows:

* Multi-user aware
  * Such apps have a full fledged user system and support multiple users and groups.
  * These apps should use OAuth or LDAP.
  * LDAP and OAuth APIs allow apps to detect if the user is a cloudron `admin`. Apps should use this flag
    to show the application's admin panel for such users.


* No user
  * Such apps have no concept of logged-in user.
  * The Cloudron provides a `website visibility` setting that allows a Cloudron admin to optionally
    install an OAuth proxy in front of such applications. In such a case, a user visiting the website first
    authenticates with the OAuth proxy and once authenticated is allowed into the application.
  * When an OAuth proxy is installed, such applications can use the `X-Authenticated-User` header from the
    [ICAP Extensions](https://tools.ietf.org/html/draft-stecher-icap-subid-00#section-3.4) de facto standard.
    This value can be used for display purposes or creating meta data for a document.


* Single user
  * Such apps only have a single user who is usually also the `admin`.
  * These apps can use Simple Auth or LDAP since they can authenticate users with a simple HTTP or LDAP request.
  * Such apps _must_ set the `singleUser` property in the manifest which will restrict login to a single user
    (configurable through the Cloudron's admin panel).

## Public and Private apps

`Private` apps display content only when they have a signed-in user. These apps can choose one of the
authentication strategies listed above.

`Public` apps display content to any visiting user (e.g a blog). These apps have a `login` url to allow
the editors & admins to login. This path can be optionally set as the `configurePath` in the manifest for
discoverability (for example, some blogs hide the login link).

Some apps allow the user to choose `private` or `public` mode or some other combination. Such configuration
is done at app install time and cannot be changed using a settings interface. It is tempting to show the user
a configuration dialog on first installation to switch the modes. This, however, leads the user to believe that
this configuration can be changed at any time later. In the case where this setting can be changed dynamically
from a settings ui in the app, it's better to simply put some sensible defaults and let the user discover
the settings. In the case where such settings cannot be changed dynamically, it is best to simply publish two
separate apps in the Cloudron store each with a different configuration.

## External User Registration

Some apps allow external users to register and create accounts. For example, a public company chat that
can invite anyone to join or a blog allowing registered commenters.

Such applications must track Cloudron users and external registered users independently (for example, using a flag).
As a thumb rule, apps must provide separate login buttons for each of the possible user sources. Such a design prevents
external users from (inadvertently) spoofing Cloudron users.

Naively handling user registration enables attacks of the following kind:
* An external user named `foo` registers in the app.
* A LDAP user named `foo` is later created on the Cloudron.
* When a user named `foo` logs in, the app cannot determine the correct `foo` anymore. Making separate login buttons for each
login source clears the confusion for both the user and the app.

## Userid

The preferred approach to track users in an application is a uuid or the Cloudron `username`.
The `username` in Cloudron is unique and cannot be changed.

Tracking users using `email` field is error prone since that may be changed by the user anytime.

## Single Sign-on

Single sign-on (SSO) is a property where a user logged in one application automatically logs into
another application without having to re-enter his credentials. When applications implement the
OAuth strategy, they automatically take part in Cloudron SSO. When a user signs in one application with
OAuth, they will automatically log into any other app implementing OAuth.

Conversely, signing off from one app, logs them off from all the apps.

## Security

The LDAP and Simple Auth strategies require the user to provide their plain text passwords to the
application. This might be a cause of concern and app developers are thus highly encouraged to integrate
with OAuth. OAuth also has the advantage of supporting Single Sign On.
