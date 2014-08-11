#!/bin/bash

SCRIPT_DIR=$(dirname $0)

CLIENT_ID="f18dbe3b7090fa0a3f6878709dd555aa"
API_KEY="ee47d2d5b2f2a4281508e3a962c488fc"
JSON=$SCRIPT_DIR/../node_modules/.bin/json
CURL="curl -s"
UBUNTU_IMAGE_SLUG="ubuntu-14-04-x64" # ID=5141286
REGION_SLUG="sfo1"
SIZE_SLUG="1gb"

function yellowtent_ssh_key() {
    # 124654 for yellowtent key
    $CURL "https://api.digitalocean.com/v1/ssh_keys/?client_id=$CLIENT_ID&api_key=$API_KEY" \
        | $JSON ssh_keys \
        | $JSON -c "this.name === \"yellowtent\"" \
        | $JSON 0.id
}

function create_droplet() {
    $CURL "https://api.digitalocean.com/v1/droplets/new?client_id=$CLIENT_ID&api_key=$API_KEY&name=base&size_slug=$SIZE_SLUG&image_slug=$UBUNTU_IMAGE_SLUG&region_slug=$REGION_SLUG&ssh_key_ids=$SSH_KEY_ID" | $JSON droplet.id
}

function get_droplet_ip() {
    $CURL "https://api.digitalocean.com/v1/droplets/$DROPLET_ID?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON droplet.ip_address
}

SSH_KEY_ID=$(yellowtent_ssh_key)
if [ -z "$SSH_KEY_ID" ]; then
    echo "Could not query yellowtent ssh key"
    exit 1
fi
echo "Detected yellowtent ssh key id: $SSH_KEY_ID"

echo "Creating Droplet"
DROPLET_ID=$(create_droplet)
if [ -z "$DROPLET_ID" ]; then
    echo "Failed to create droplet"
    exit 1
fi

DROPLET_IP=$(get_droplet_ip $DROPLET_ID)
if [ -z "$DROPLET_IP" ]; then
    echo "Failed to get droplet ip"
    exit 1
fi

echo "Creating base image using droplet with IP $DROPLET_IP";
cd $SCRIPT_DIR/..

while true; do
    echo "Trying to copy init script to droplet"
    scp -o ConnectTimeout=30 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ../appstore/ssh/id_rsa_yellowtent ./scripts/initializeBaseUbuntuImage.sh root@$DROPLET_IP:.
    if [ $? -eq 0 ]; then
        break
    fi
    echo "Timedout, trying again"
done

echo "Executing init script"
ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ../appstore/ssh/id_rsa_yellowtent root@$DROPLET_IP "/bin/bash /root/initializeBaseUbuntuImage.sh"
if [ $? -ne 0 ]; then
    echo "Init script failed"
    exit 1
fi

echo "Shutting down droplet"
ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ../appstore/ssh/id_rsa_yellowtent root@$DROPLET_IP "shutdown -f now"

# wait 10 secs for actual shutdown
sleep 10

# GET https://api.digitalocean.com/v1/droplets/[droplet_id]/power_off/?client_id=[client_id]&api_key=[api_key]
# GET https://api.digitalocean.com/v1/droplets/[droplet_id]/snapshot/?name=[snapshot_name]&client_id=[client_id]&api_key=[api_key]
# GET https://api.digitalocean.com/v1/droplets/[droplet_id]/destroy/?client_id=[client_id]&api_key=[api_key]
# wait for event
# GET https://api.digitalocean.com/v1/images/[image_id_or_slug]/?client_id=[client_id]&api_key=[api_key]

