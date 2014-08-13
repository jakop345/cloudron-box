#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

CLIENT_ID="f18dbe3b7090fa0a3f6878709dd555aa"
API_KEY="ee47d2d5b2f2a4281508e3a962c488fc"
JSON="$SCRIPT_DIR/../node_modules/.bin/json"
CURL="curl -s"
UBUNTU_IMAGE_SLUG="ubuntu-14-04-x64" # ID=5141286
DATE=`date +%Y-%m-%d-%H%M%S`
SNAPSHOT_NAME="box-base-image-$DATE"

function get_ssh_key_id() {
    $CURL "https://api.digitalocean.com/v1/ssh_keys/?client_id=$CLIENT_ID&api_key=$API_KEY" \
        | $JSON ssh_keys \
        | $JSON -c "this.name === \"$1\"" \
        | $JSON 0.id
}

function create_droplet() {
    local REGION_SLUG="sfo1"
    local SIZE_SLUG="1gb"
    local SSH_KEY_ID="$1"

    $CURL "https://api.digitalocean.com/v1/droplets/new?client_id=$CLIENT_ID&api_key=$API_KEY&name=base&size_slug=$SIZE_SLUG&image_slug=$UBUNTU_IMAGE_SLUG&region_slug=$REGION_SLUG&ssh_key_ids=$SSH_KEY_ID" | $JSON droplet.id
}

function get_droplet_ip() {
    local DROPLET_ID="$1"
    $CURL "https://api.digitalocean.com/v1/droplets/$DROPLET_ID?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON droplet.ip_address
}

function power_off_droplet() {
    local DROPLET_ID="$1"
    local EVENT_ID=`$CURL "https://api.digitalocean.com/v1/droplets/$DROPLET_ID/power_off/?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON event_id`

    echo "Powered off droplet. Event id: $EVENT_ID"

    while true; do
        local EVENT_STATUS=`$CURL "https://api.digitalocean.com/v1/events/$EVENT_ID/?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON event.action_status`
        if [ "$EVENT_STATUS" == "done" ]; then
            break
        fi
        echo "Waiting for droplet to power off"
        sleep 10
    done
}

function snapshot_droplet() {
    local DROPLET_ID="$1"
    local SNAPSHOT_NAME="$2"
    local EVENT_ID=`$CURL "https://api.digitalocean.com/v1/droplets/$DROPLET_ID/snapshot/?name=$SNAPSHOT_NAME&client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON event_id`

    echo "Droplet snapshotted as $SNAPSHOT_NAME. Event id: $EVENT_ID"

    while true; do
        local EVENT_STATUS=`$CURL "https://api.digitalocean.com/v1/events/$EVENT_ID/?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON event.action_status`
        if [ "$EVENT_STATUS" == "done" ]; then
            break
        fi
        echo "Waiting for snapshot to complete"
        sleep 10
    done
}

function destroy_droplet() {
    local DROPLET_ID="$1"
    local EVENT_ID=`$CURL "https://api.digitalocean.com/v1/droplets/$DROPLET_ID/destroy/?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON event_id`
    echo "Droplet destroyed. Event id: $EVENT_ID"

    while true; do
        local EVENT_STATUS=`$CURL "https://api.digitalocean.com/v1/events/$EVENT_ID/?client_id=$CLIENT_ID&api_key=$API_KEY" | $JSON event.action_status`
        if [ "$EVENT_STATUS" == "done" ]; then
            break
        fi
        echo "Waiting for droplet to destroy"
        sleep 10
    done
}

function get_image_id() {
    local SNAPSHOT_NAME="$1"
    $CURL "https://api.digitalocean.com/v1/images/?client_id=$CLIENT_ID&api_key=$API_KEY&filter=my_images" \
        | $JSON images \
        | $JSON -c "this.name === \"$SNAPSHOT_NAME\"" 0.id
}

# SCRIPT BEGIN

YELLOWTENT_SSH_KEY_ID=$(get_ssh_key_id "yellowtent")
if [ -z "$YELLOWTENT_SSH_KEY_ID" ]; then
    echo "Could not query yellowtent ssh key"
    exit 1
fi
echo "Detected yellowtent ssh key id: $YELLOWTENT_SSH_KEY_ID" # 124654 for yellowtent key

echo "Creating Droplet"
DROPLET_ID=$(create_droplet $YELLOWTENT_SSH_KEY_ID)
if [ -z "$DROPLET_ID" ]; then
    echo "Failed to create droplet"
    exit 1
fi
echo "Created droplet with id: $DROPLET_ID"

DROPLET_IP=$(get_droplet_ip $DROPLET_ID)
if [ -z "$DROPLET_IP" ]; then
    echo "Failed to get droplet ip"
    exit 1
fi

echo "Droplet IP : [$DROPLET_IP]";

# If we run scripts overenthusiastically without the wait, setup script randomly fails
echo "Waiting 120 seconds for droplet creation"
sleep 120

chmod o-rw,g-rw,u-w $SCRIPT_DIR/ssh/*
while true; do
    echo "Trying to copy init script to droplet"
    scp -o ConnectTimeout=10 -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i $SCRIPT_DIR/ssh/id_rsa_yellowtent $SCRIPT_DIR/initializeBaseUbuntuImage.sh root@$DROPLET_IP:.
    if [ $? -eq 0 ]; then
        break
    fi
    echo "Timedout, trying again in 30 seconds"
    sleep 30
done

echo "Executing init script"
ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i $SCRIPT_DIR/ssh/id_rsa_yellowtent root@$DROPLET_IP "/bin/bash /root/initializeBaseUbuntuImage.sh"
if [ $? -ne 0 ]; then
    echo "Init script failed"
    exit 1
fi

echo "Shutting down droplet with id : $DROPLET_ID"
ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i $SCRIPT_DIR/ssh/id_rsa_yellowtent root@$DROPLET_IP "shutdown -f now"

# wait 10 secs for actual shutdown
echo "Waiting for 10 seconds for droplet to shutdown"
sleep 10

echo "Powering off droplet"
(power_off_droplet $DROPLET_ID)

echo "Snapshotting as $SNAPSHOT_NAME"
(snapshot_droplet $DROPLET_ID $SNAPSHOT_NAME)

echo "Destroying droplet"
(destroy_droplet $DROPLET_ID)

IMAGE_ID=$(get_image_id $SNAPSHOT_NAME)
echo "Image id is $IMAGE_ID"

