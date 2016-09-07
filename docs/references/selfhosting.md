# Self host Cloudron

The Cloudron platform can be installed on your own cloud server. The self hosted version comes with all the same features as the managed version.

## CLI Tool

The [Cloudron tool](https://git.cloudron.io/cloudron/cloudron-cli) is used for managing a Cloudron. It has a `machine` 
subcommand that can be used to create, update and maintain a self-hosted Cloudron.

Installing the CLI tool requires node.js and npm. The CLI tool can be installed using the following command:

```
npm install -g cloudron
```

Depending on your setup, you may need to run this as root.

You should now be able to run the `cloudron machine help` command in a shell.

### Machine subcommands

```
create      Creates a new Cloudron
restore     Restores a Cloudron
migrate     Migrates a Cloudron
update      Upgrade or updates a Cloudron
eventlog    Get Cloudron eventlog
logs        Get Cloudron logs
ssh         Get remote SSH connection
backup      Manage Cloudron backups
```

## AWS EC2

### Requirements

To run the Cloudron on AWS, first sign up with [Amazon AWS](https://aws.amazon.com/).

The Cloudron uses the following AWS services:

* **EC2** for creating a virtual private server that runs the Cloudron code.
* **Route53** for DNS. The Cloudron will manage all app subdomains as well as the email related DNS records automatically.
* **S3** to store encrypted Cloudron backups.

The minimum requirements for a Cloudron depends on the apps installed. The absolute minimum required EC2 instance is `t2.small`.

The Cloudron runs best on instances which do not have a burst mode VCPU.

The system disk space usage of a Cloudron is around 15GB. This results in a minimum requirement of about 30GB to give some headroom for app installations and user data.

### Cost Estimation

Taking the minimal requirements of hosting on EC2, with a backup retention of 2 days, the cost estimation per month is as follows:

```
Route53:       0.90
EC2:          19.04
EBS:           3.00
S3:            1.81
-------------------------
Total:      $ 24.75/mth
```

For custom cost estimation, please use the [AWS Cost Calculator](http://calculator.s3.amazonaws.com/index.html)

### Setup

Open the AWS console and create the required resources:

1. Create a Route53 zone for your domain. Be sure to set the Route53 nameservers for your domain in your name registrar.

2. Create a S3 bucket for backups. The bucket region **must* be the same region as where you intend to create your Cloudron (EC2).

When creating the S3 bucket, it is important to choose a region. Do **NOT** choose `US Standard`.

The supported regions are:
    * US East (N. Virginia)       us-east-1
    * US West (N. California)     us-west-1
    * US West (Oregon)            us-west-2
    * Asia Pacific (Mumbai)       ap-south-1
    * Asia Pacific (Seoul)        ap-northeast-2
    * Asia Pacific (Sydney)       ap-southeast-2
    * Asia Pacific (Tokyo)        ap-northeast-1
    * EU (Frankfurt)              eu-central-1
    * EU (Ireland)                eu-west-1
    * South America (São Paulo)   sa-east-1

3. Create a new SSH key or upload an existing SSH key in the target region (`Key Pairs` in the left pane of the EC2 console).

4. Create AWS credentials. You can either use root **or** IAM credentials.
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
        },
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": [
                "arn:aws:s3:::<your bucket name>",
                "arn:aws:s3:::<your bucket name>/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "ec2:*",
            "Resource": [
                "*"
            ],
            "Condition": {
                "StringEquals": {
                    "ec2:Region": "<ec2 region>"
                }
            }
        }
    ]
}
```

### Create the Cloudron

Create the Cloudron using the `cloudron machine` command:

```
cloudron machine create ec2 \
        --region <aws-region> \
        --type t2.small \
        --disk-size 30 \
        --ssh-key <ssh-key-name-or-filepath> \
        --access-key-id <aws-access-key-id> \
        --secret-access-key <aws-access-key-secret> \
        --backup-bucket <bucket-name> \
        --backup-key '<secret>' \
        --fqdn <domain>
```

The `--region` is the region where your Cloudron is to be created. For example, `us-west-1` for N. California and `eu-central-1` for Frankfurt. A complete list of available
regions is list <a href="//docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html#concepts-available-regions" target="_blank">here</a>.

The `--disk-size` parameter indicates the volume (hard disk) size to be allocated for the Cloudron.

The `--ssh-key` is the path to a PEM file or the private SSH Key. If your key is located as `~/.ssh/id_rsa_<name>`, you can
also simply provide the `name` as the argument.

The `--backup-key '<secret>'` will be used to encrypt all backups prior to uploading to S3. Keep that secret in a safe place, as you need it to restore your Cloudron from a backup! You can generate a random key using `pwgen -1y 64`. Be sure to put single quotes
around the `secret` to prevent accidental shell expansion.

**NOTE**: The `cloudron machine create` subcommand will automatically create a corresponding VPC, subnet and security group for your Cloudron, unless `--subnet` and `--security-group` arguments are explicitly passed in. If you want to reuse existing resources, please ensure that the security group does not limit any traffic to the Cloudron since the Cloudron manages its own firewall and that the subnet has an internet gateway setup in the routing table.

## First time setup

Visit `https://my.<domain>` to do first time setup of your Cloudron.

1. The website should already have a valid TLS certificate. If you see any certificate warnings, it means your Cloudron was not created correctly.
2. If you see a login screen, instead of a setup screen, it means that someone else got to your Cloudron first and set it up
already! In this unlikely case, simply delete the EC2 instance and create a new Cloudron again.

Once the setup is done, you can access the admin page in the future at `https://my.<domain>`.

## Backups

The Cloudron has a backup schedule of creating one once a day. In addition to regularly scheduled backups, a backup is also created if you update the Cloudron or any of the apps (in this case only the app in question will get backed up).

Since this might result in a lot of backup data on your S3 backup bucket, we recommend adjusting the bucket properties. This can be done adding a lifecycle rule for that bucket, using the AWS console. S3 supports both permanent deletion or moving objects to the cheaper Glacier storage class based on an age attribute. With the current daily backup schedule a setting of two days should be already sufficient for most use-cases.

If your Cloudron is running, you can list backups using the following command:
```
cloudron machine backup list <domain>
```

Alternately, you can list the backups by querying S3 using the following command:
```
cloudron machine backup list --provider ec2 \
        --region <region> \
        --access-key-id <access-key-id> \
        --secret-access-key <secret-access-key> \
        --backup-bucket <s3 bucket name> \
        <domain>
```

## Restore

The Cloudron can restore itself from a backup using the following command:
```
cloudron machine create ec2 \
		--backup <backup-id> \
        --region <aws-region> \
        --type t2.small \
        --disk-size 30 \
        --ssh-key <ssh-key-name> \
        --access-key-id <aws-access-key-id> \
        --secret-access-key <aws-access-key-secret> \
        --backup-bucket <bucket-name> \
        --backup-key <secret> \
        --fqdn <domain>
```

The backup id can be obtained by [listing the backup](/references/selfhosting.html#backups). Other arguments are similar to [Cloudron creation](/references/selfhosting.html#create-the-cloudron). Once the new instance has completely restored, you can safely terminate the old Cloudron from the AWS console.

## Updates

Apps installed from the Cloudron Store are updated automatically every night.

The Cloudron platform itself updates in two ways:

* An **update** is applied onto the running server instance. Such updates are performed every night. You can use the Cloudron UI to perform updates.

* An **upgrade** requires a new OS image and thus has to be performed using the CLI tool. This process involves creating a new EC2 instance is created using the latest image and all the data and apps are restored. The `cloudron machine update` command can be used when an _upgrade_ is available (you will get a notification in the UI).
```
    cloudron machine update --ssh-key <ssh-key> <domain>
```
Once the upgrade is complete, you can safely terminate the old EC2 instance.

The Cloudron will always make a complete backup before attempting an update or upgrade. In the unlikely case an update fails, it can be [restored](/references/selfhosting.html#restore).

## SSH

If you want to SSH into your Cloudron, you can
```
ssh -p 202 -i ~/.ssh/ssh_key_name root@my.<domain>
```

If you are unable to connect, verify the following:
* Be sure to use the **my.** subdomain (eg. my.foobar.com).
* The SSH Key should be in PEM format. If you are using Putty PPK files, follow [this article](http://stackoverflow.com/questions/2224066/how-to-convert-ssh-keypairs-generated-using-puttygenwindows-into-key-pairs-use) to convert it to PEM format.
* The SSH Key must have correct permissions (400) set (this is a requirement of the ssh client).

## Mail

Spammers frequently abuse EC2 public IP addresses and as a result your Cloudron might possibly start out with a bad
reputation. The good news is that most IP based blacklisting services cool down over time. The Cloudron
sets up DNS entries for SPF, DKIM automatically and reputation should be easy to get back.

* Once your Cloudron is ready, apply for a Reverse DNS record to be setup for your domain. You can find the AWS request
form [here](https://aws-portal.amazon.com/gp/aws/html-forms-controller/contactus/ec2-email-limit-rdns-request).

* Check if your IP is listed in any DNSBL list [here](http://multirbl.valli.org/). In most cases, you can apply for removal
of your IP by filling out a form at the DNSBL manager site.

* Finally, check your spam score at [mail-tester.com](https://www.mail-tester.com/).

## Debugging

To debug the Cloudron CLI tool:

* `DEBUG=* cloudron <cmd>`

You can also [SSH](#ssh) into your Cloudron and collect logs.

* `journalctl -a -u box -u cloudron-installer` to get debug output of box related code.
* `docker ps` will give you the list of containers. The addon containers are named as `mail`, `postgresql`, `mysql` etc. If you want to get a specific 
   containers log output, `journalctl -a CONTAINER_ID=<container_id>`.

## Other Providers

Currently, we do not support other cloud server provider. Please let us know at [support@cloudron.io](mailto:support@cloudron.io), if you want to see other providers supported.

## Help

If you run into any problems, join us in our [chat](https://chat.cloudron.io) or [email us](mailto:support@cloudron.io).

