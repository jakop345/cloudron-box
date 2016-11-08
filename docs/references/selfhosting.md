# Overview

The Cloudron platform can be installed on public cloud servers from EC2, Digital Ocean, Hetzner,
Linode, OVH, Scaleway, Vultr etc. Running Cloudron on a home server or company intranet is work
in progress.

If you run into any trouble following this guide, ask us at our [chat](https://chat.cloudron.io).

# Understand

Before installing the Cloudron, it is helpful to understand Cloudron's design. The Cloudron
intends to make self-hosting effortless. It takes care of updates, backups, firewall, dns setup,
certificate management etc. All app and user configuration is carried out using the web interface.

This approach to self-hosting means that the Cloudron takes complete ownership of the server and
only tracks changes that were made via the web interface. Any external changes made to the server
(i.e other than via the Cloudron web interface or API) may be lost across updates.

The Cloudron requires a domain name when it is installed. Apps are installed into subdomains.
The `my` subdomain is special and is the location of the Cloudron web interface. For this to
work, the Cloudron requires a way to programmatically configure the DNS entries of the domain.
Note that the Cloudron will never overwrite _existing_ DNS entries and refuse to install
apps on existing subdomains.

# CLI Tool

The [Cloudron tool](https://git.cloudron.io/cloudron/cloudron-cli) is useful for managing
a Cloudron. <b class="text-danger">The Cloudron CLI tool has to be run on a Laptop or PC</b>

## Linux & OS X

Installing the CLI tool requires node.js and npm. The CLI tool can be installed using the following command:

```
npm install -g cloudron
```

Depending on your setup, you may need to run this as root.

On OS X, it is known to work with the `openssl` package from homebrew.

See [#14](https://git.cloudron.io/cloudron/cloudron-cli/issues/14) for more information.

## Windows

The CLI tool does not work on Windows. Please contact us on our [chat](https://chat.cloudron.io) if you want to help with Windows support.

# Installing

## Choose Domain

A domain name is required when installing the Cloudron. Currently, only Second Level Domains
are supported. For example, `example.com`, `example.co.uk` will work fine. Choosing a domain
name at any other level like `cloudron.example.com` will not work.

The domain name must use one of the following name servers:
* AWS Route 53
* Digital Ocean
* Wildcard - If your domain does not use any of the name servers above, you can manually add
a wildcard (`*`) DNS entry.

You will have to provide the DNS API credentials after you complete the installation.

## Create server

Create an `Ubuntu 16.04 (Xenial)` server with at-least `1gb` RAM. Do not make any changes
to vanilla ubuntu. Be sure to allocate a static IPv4 address for your server.

### Linode

Since Linode does not manage SSH keys, be sure to add the public key to
`/root/.ssh/authorized_keys`.

### Scaleway

Use the [boot script](https://github.com/scaleway-community/scaleway-docker/issues/2) to
enable memory accouting.

## Setup `my` subdomain

The Cloudron web interface is installed at the `my` subdomain of your domain.
Add a `A` DNS record for the `my` subdomain with the IP of the server created
above. Doing this will allow the Cloudron to start up with a valid TLS certificate.

## Run setup

SSH into your server:

```
# wget https://git.cloudron.io/cloudron/box/raw/master/scripts/cloudron-setup
# chmod +x cloudron-setup
# ./cloudron-setup --domain <domain> --provider <digitalocean|ec2|generic|scaleway>
```

The setup will take around 10-15 minutes.

`cloudron-setup` takes the following arguments:

* `--domain` is the domain name in which apps are installed. Currently, only Second Level
Domains are supported. For example, `example.com`, `example.co.uk`, `example.rocks` will
work fine. Choosing a domain name at any other level like `cloudron.example.com` will not
work.

* `--provider` is the name of your VPS provider. If the name is not on the list, simply
choose `generic`. If the Cloudron does not complete initialization, it may mean that
we have to add some vendor specific quirks. Please open a
[bug report](https://git.cloudron.io/cloudron/box/issues) in that case.

Optional arguments used for update and restore:

* `--version` is the version of Cloudron to install. By default, the setup script installs
the latest version. This is useful when restoring a Cloudron from a backup.

* `--restore-url` is an URL to the backup to restore to.

* `--restore-key` is the encryption key to use for unpacking the backup.

## Finish setup

Once the setup script completes, visit `https://my.<domain>` to complete the installation.

Please note the following:

1. The website should already have a valid TLS certificate. If you see any certificate warnings, it means your Cloudron was not created correctly.

2. If you see a login screen, instead of a setup screen, it means that someone else got to your Cloudron first and set it up
already! In this unlikely case, simply delete the server and start over.

Once the setup is done, you can access the admin page in the future at `https://my.<domain>`.

## DNS

Cloudron has to be given the API credentials for configuring your domain under `Certs & Domains`
in the web UI.

### Route 53

Create root or IAM credentials and choose `Route 53` as the DNS provider.

* For root credentials:
  * In AWS Console, under your name in the menu bar, click `Security Credentials`
  * Click on `Access Keys` and create a key pair.
* For IAM credentials:
    * You can use the following policy to create IAM credentials:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "route53:*",
            "Resource": [
                "arn:aws:route53:::hostedzone/<hosted zone id>"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "route53:ListHostedZones",
                "route53:GetChange"
            ],
            "Resource": [
                "*"
            ]
        }
    ]
}
```

### Digital Ocean

Create an API token with read+write access and choose `Digital Ocean` as the DNS provider.

### Other

If your domain *does not* use Route 53 or Digital Ocean, setup a wildcard (`*`) DNS `A` record that points to the
IP of the server created above. If your DNS provider has an API, please open an
[issue](https://git.cloudron.io/cloudron/box/issues) and we may be able to support it.

## Backups

The Cloudron creates encrypted backups once a day. Each app is backed up independently and these
backups have the prefix `appbackup_`. The platform state is backed up independently with the
prefix `backup_`.

By default, backups reside in `/var/backups`. Having backups reside in the same location as the
server instance is dangerous and it must be changed to an external storage location like `S3`
as soon as possible.

### S3

Provide S3 backup credentials in the `Settings` page.

Create a bucket in S3 (You have to have an account at [AWS](https://aws.amazon.com/)). The bucket can be setup to periodically delete old backups by
adding a lifecycle rule using the AWS console. S3 supports both permanent deletion
or moving objects to the cheaper Glacier storage class based on an age attribute.
With the current daily backup schedule a setting of two days should be sufficient
for most use-cases.

* For root credentials:
    * In AWS Console, under your name in the menu bar, click `Security Credentials`
    * Click on `Access Keys` and create a key pair.
* For IAM credentials:
* You can use the following policy to create IAM credentials:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::<your bucket name>",
                "arn:aws:s3:::<your bucket name>/*"
            ]
        }
    ]
}
```

# Email

Cloudron has a built-in email server. By default, it only sends out email on behalf of apps
(for example, password reset or notification). You can enable the email server for sending
and receiving mail on the `settings` page. This feature is only available if you have setup
a DNS provider like Digital Ocean or Route53.

Your server's IP plays a big role in how emails from our Cloudron get handled. Spammers
frequently abuse public IP addresses and as a result your Cloudron might possibly start
out with a bad reputation. The good news is that most IP based blacklisting services cool
down over time. The Cloudron sets up DNS entries for SPF, DKIM, DMARC automatically and
reputation should be easy to get back.

## Checklist

* Once your Cloudron is ready, setup a Reverse DNS PTR record to be setup for the `my` subdomain.

    * AWS/EC2 - Fill the PTR [request form](https://aws-portal.amazon.com/gp/aws/html-forms-controller/contactus/ec2-email-limit-rdns-request.

    * Digital Ocean - Digital Ocean sets up a PTR record based on the droplet's name. So, simply rename
    your droplet to `my.<domain>`.

    * Scaleway - Edit your security group to allow email. You can also set a PTR record on the interface with your
    `my.<domain>`.

* Check if your IP is listed in any DNSBL list [here](http://multirbl.valli.org/). In most cases,
you can apply for removal of your IP by filling out a form at the DNSBL manager site.

* Finally, check your spam score at [mail-tester.com](https://www.mail-tester.com/). The Cloudron
should get 100%, if not please let us know.

# Updates

Apps installed from the Cloudron Store are automatically updated every night.

The Cloudron platform itself updates in two ways: update or upgrade.

### Update

An **update** is applied onto the running server instance. Such updates are performed
every night. You can also use the Cloudron UI to initiate an update immediately.

The Cloudron will always make a complete backup before attempting an update. In the unlikely
case an update fails, it can be [restored](/references/selfhosting.html#restore).

### Upgrade

An **upgrade** requires a new OS image and thus involves creating the Cloudron from scratch.
This process involves creating a new server with the latest code and restoring it from the
last backup.

* Create a new backup - `cloudron machine backup create <domain>`

* List the latest backup - `cloudron machine backup list <domain>`

* Make the latest box backup public (this can be done from the S3 console). Also, copy the URL of
  the latest backup for use as the `restore-url` below.

* Create a new Cloudron by following the [installing](/references/selfhosting.html#installing) section.
  When running the setup script, pass in the `version`, `restore-key` and `restore-url` flags.
  The `version` field is displayed in the upgrade dialog in the web ui.

* Make the box backup private, once the upgrade is complete.

# Restore

To restore a Cloudron from a specific backup:

* Select the backup - `cloudron machine backup list <domain>`

* Make the box backup public (this can be done from the S3 console). Also, copy the URL of
  the backup for use as the `restore-url` below.

* Create a new Cloudron by following the [installing](/references/selfhosting.html#installing) section.
  When running the setup script, pass in the `version`, `restore-key` and `restore-url` flags.
  The `version` field is the version of the Cloudron that the backup corresponds to (it is embedded
  in the backup file name).

* Make the box backup private, once the upgrade is complete.

# Debug

You can SSH into your Cloudron and collect logs:

* `journalctl -a -u box` to get debug output of box related code.
* `docker ps` will give you the list of containers. The addon containers are named as `mail`, `postgresql`,
   `mysql` etc. If you want to get a specific container's log output, `journalctl -a CONTAINER_ID=<container_id>`.

# Help

If you run into any problems, join us at our [chat](https://chat.cloudron.io) or [email us](mailto:support@cloudron.io).
