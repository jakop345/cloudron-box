# User Manual

## Introduction

The Cloudron is the best way to run apps and manage users on your private server.
When we say `private`, we mean that we create a virtual server that is exclusive
to you. Each cloudron.io user gets their own server.

You might wonder that there are many 1-click app solutions out there and what's so special
about Cloudron? Most 1-click solutions simply put code into a server and leave it at that.
There's so much more to do:
1. Configure a domain to point to your server
2. Setup SSL certificates and renew them periodically
3. Ensure app is backed up correctly
4. Ensure app is uptodate and secure
5. Have a mechanism to quickly restore the app from a backup
6. Manage users across all your apps
7. Notifications about the app status

... and so on ...

We made the Cloudron to dramatically lower the bar for people to run apps on servers. Just provide
a domain name, install apps and add users. All the server management listed above is completely automated.

If you want to learn more about the secret sauce that makes the Cloudron, please read our [architecture overview](/references/architecture.html).

## Use cases

What can you run on a Cloudron? Here are some of the apps you can run on a Cloudron:
* RSS Reader
* Chat, IRC, Jabber servers
* Blog
* File syncing and sharing
* Code hosting
* Email

Our list of apps is growing everyday, so be sure to [follow us on twitter](https://twitter.com/cloudron_io).

## Activation

When you first create the Cloudron, the setup wizard will ask you to setup an administrator
account. Don't worry, a Cloudron adminstrator doesn't need to know anything about maintaining
a server! It's the whole reason why we made the Cloudron. Being a Cloudron administrator is
more analagous to being the owner of a smartphone. You can always add more administrators to
the Cloudron from the `Users` menu item.

<img src="/docs/img/webadmin_domain.png" class="shadow">

Tip: The Cloudron administration panel is located at the `my` subdomain. You might want to bookmark
this link!

## Apps

### Installation

You can install apps on the Cloudron by choosing the `App Store` menu item. Use the 'Search' bar
to search for apps.

Clicking on app gives you information about the app.

<img src="/docs/img/app_info.png" class="shadow">

Clicking the `Install` button will show an install dialog like below:

<img src="/docs/img/app_install.png" class="shadow">

The `Location` field is the subdomain in which your app will be installed. For example, use the
`mail` location to access your web mail client or the `blog` location to access your Wordpress blog.

Tip: You can access the apps directly on your browser using `blog.<mydomain>`. You don't have to
visit the Cloudron administration panel.

`Access control` specifies who can access this app.

* `Every Cloudron user` - Any user in your Cloudron can access the app. Initially, you are the only
   user in your Cloudron. Unless you explicitly invite others, nobody else can access these apps.
   Note that the term 'access' depends on the app. For a blog, this means that nobody can post new
   blog posts (but anybody can view them). For a chat server, this means that nobody can access
   your chat server.

* `Restrict to groups` - Only users in the groups can access the app.

### Updates

All your apps automatically update as and when the application author releases an update. The Cloudron
will attempt to update around midnight of your timezone.

Some app updates are not automatic. This can happen if a new version of the app has dropped some features
that you were relying on. In such a case, the update has to be manually approved. This is simply a matter
of clicking the `Update` button after you read about the changes.

### Backups

All your apps will automatically backup and those backups are stored encrypted in Amazon S3. You don't have
to do anything about it.

### Configuration

Apps can be reconfigured using the `Configure` dialog. Click on the wrench icon in the application grid
to bring up the following dialog:

<img src="/docs/img/app_configure.png" class="shadow">

You can do the following:
* Change the location to move the app to another subdomain. Say, you want to move your blog from `blog` to `about`.
* Change who can access the app.

Changing an app's configuration has a small downtime (usually around a minute).

### Restore

Apps can be restored to a previous backup by clicking on the `Restore` button. Note that restoring previous
data might also restore the previous version of the software. For example, you might be currently using
Version 5 of the app. If you restore to a backup that was made with Version 3 of the app, then the restore
operation will install Version 3 of the app. This is because the latest version may not be able to handle old data.

### Uninstall

You can uninstall an app by clicking the `Uninstall` button. Note that all data associated with the app will
be immediately removed from the Cloudron. App data might still persist in your old backups and the
[CLI tool](https://git.cloudron.io/cloudron/cloudron-cli) provides a way to restore from those old backups should
it be required.

### Embedding Apps

It is possible to embed Cloudron apps into other websites. By default, this is disabled to prevent
[Clickjacking](https://cloudron.io/blog/2016-07-15-site-embedding.html).

You can set a website that is allowed to embed your Cloudron app using the Configure app dialog.

## Custom domain

When you create a Cloudron from cloudron.io, we provide a subdomain under `cloudron.me` like `girish.cloudron.me`.
Apps are available under that subdomain using a hyphenated name like `blog-girish.cloudron.me`.

Domain names are a thing of pride and the Cloudron makes it easy to make your apps accessible from memorable locations like `blog.girish.in`.

### Single app on a custom domain

This approach is applicable if you desire that only a single app be accessing from a custom
domain. For this, open the app's configure dialog and choose `External Domain` in the location dropdown.

<img src="/docs/img/app_external_domain.png" class="shadow">

This dialog will suggest you to add a `CNAME` record. Once you setup a CNAME record with your DNS provider,
the app will be accessible from that external domain.

### Entire Cloudron on a custom domain

This approach is applicable if you want all your apps to be accessible from subdomains of your custom domain.
For example, `blog.girish.in`, `notes.girish.in`, `owncloud.girish.in`, `mail.girish.in` and so on. This
approach is also the only way that the Cloudron supports for sending and receiving emails from your domain.

For this, go to the 'Domains & Certs' menu item.

<img src="/docs/img/custom_domain_menu.png" class="shadow">

Change the domain name to your custom domain. Currently, we require that your domain be hosted on AWS Route53.

<img src="/docs/img/custom_domain_change.png" class="shadow">

Moving to a custom domain will retain all your apps and data and will take around 15 minutes. If you require assistance with another provider,
<a href="mailto:support@cloudron.io">just let us know</a>.

## User management

### Users

You can invite new users (friends, family, colleagues) with their email address from the `Users` menu. They will
receive an invite to sign up with your Cloudron. They can now access the apps that you have given them access
to.

<img src="/docs/img/users.png" class="shadow">

To remove a user, simply remove them from the list. Note that the removed user cannot access any app anymore.

### Groups

Groups provide a convenient way to restrict access to your apps. Simply add one or more users to a group
and restrict the access for an app to that group. You can create a group by using the `Groups` menu item.

<img src="/docs/img/groups.png" class="shadow">

To set the access restriction use the app's configure dialog.

<img src="/docs/img/app_access_control.png" class="shadow">

## Login

### Cloudron admin

The Cloudron admin page is always located at the `my` subdomain of your Cloudron domain. For custom domains,
this will be like `my.girish.in`. For domains from cloudron.io, this will be like `my-girish.cloudron.me`.

### Apps (single sign-on)

An important feature of the Cloudron is Single Sign-On. You use the same username & password for logging in
to all your apps. No more having to manage separate set of credentials for each service!

### Single user apps

Some apps only work with a single user. For example, a notes app might allow only a single user to login and add
notes. For such apps, you will be prompted during installation to select the single user who can access the app.

<img src="/docs/img/app_single_user.png" class="shadow">

If you want multiple users to use the app independently, simply install the app multiple times to different locations.

## Email

The Cloudron has a built-in email server. The primary email address is the same as the username. Emails can be sent
and received from `<username>@<domain>`. The Cloudron does not allow masquerading - one user cannot send email
pretending to be another user.

### Receiving email (IMAP)

Use the following settings to receive email.

  * Server Name - Use the `my` subdomain of your Cloudron
  * Port - 993
  * Connection Security - TLS
  * Username/password - Same as your Cloudron credentials

### Sending email (SMTP)

Use the following settings to send email.

  * Server Name - Use the `my` subdomain of your Cloudron
  * Port - 587
  * Connection Security - STARTTLS
  * Username/password - Same as your Cloudron credentials

### Email filters (Sieve)

Use the following settings to setup email filtering users via Manage Sieve.

  * Server Name - Use the `my` subdomain of your Cloudron
  * Port - 4190
  * Connection Security - TLS
  * Username/password - Same as your Cloudron credentials

The [Rainloop](https://cloudron.io/appstore.html?app=net.rainloop.cloudronapp) and [Roundcube](https://cloudron.io/appstore.html?app=net.roundcube.cloudronapp)
apps are already pre-configured to use the above settings.

### Aliases

You can configure one or more aliases alongside the primary email address of each user. You can set aliases by editing the
user's settings, available behind the edit button in the user listing. Note that aliases cannot conflict with existing user names.

<img src="/docs/img/email_alias.png" class="shadow">

Currently, it is not possible to login using the alias for SMTP/IMAP/Sieve services. Instead, add the alias as an identity in
your mail client but login using the Cloudron credentials.

### Subaddresses

Emails addressed to `<username>+tag@<domain>` will be delivered to the `username` mailbox. You can use this feature to give out emails of the form
`username+kayak@<domain>`, `username+aws@<domain>` and so on and have them all delivered to your mailbox.

## Graphs

The Graphs view shows an overview of the disk and memory usage on your Cloudron.

<img src="/docs/img/graphs.png" class="shadow">

The `Disk Usage` graph shows you how much disk space you have left. Note that the Cloudron will
send the Cloudron admins an email notification when the disk is ~90% full.

The `Apps` Memory graph shows the memory consumed by each installed app. You can click on each segment
on the graph to see the memory consumption over time in the chart below it.

The `System` Memory graph shows the overall memory consumption on the entire Cloudron. If you see
the Free memory < 50MB frequently, you should consider upgrading to a Cloudron with more memory.

## Activity log

The `Activity` view shows the activity on your Cloudron. It includes information about who is using
the apps on your Cloudron and also tracks configuration changes.

<img src="/docs/img/activity.png" class="shadow">

## Domains and SSL Certificates

All apps on the Cloudron can only be reached by `https`. The Cloudron automatically installs and
renews certificates for your apps as needed. Should installation of certificate fail for reasons
beyond it's control, Cloudron admins will get a notification about it.

## API Access

All the operations listed in this manual like installing app, configuring users and groups, are
completely programmable with a [REST API](/references/api.html).

## Moving to a larger Cloudron

When using a Cloudron from cloudron.io, it is easy to migrate your apps and data to a bigger server.
In the `Settings` page, you can change the plan.

<insert picture>

## Command line tool

If you are a software developer or a sysadmin, the Cloudron comes with a CLI tool that can be
used to develop custom apps for the Cloudron. Read more about it [here](https://git.cloudron.io/cloudron/cloudron-cli).