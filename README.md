Cloudron a Smart Server
=======================



Selfhost Instructions
---------------------

The smart server currently relies on an AWS account with access to Route53 and S3 and is tested on DigitalOcean and EC2.

First create a virtual private server with Ubuntu 15.04 and run the following commands in an ssh session to initialize the base image:

```
TODO curl from a well known released version of installer.sh
./installer.sh <domain> <aws access key> <aws acccess secret> <backup bucket> <provider> <release sha1>
```
