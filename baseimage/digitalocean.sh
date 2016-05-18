#!/bin/bash

if [[ -z "${DIGITAL_OCEAN_TOKEN}" ]]; then
    echo "Script requires DIGITAL_OCEAN_TOKEN env to be set"
    exit 1
fi

if [[ -z "${JSON}" ]]; then
    echo "Script requires JSON env to be set to path of JSON binary"
    exit 1
fi

readonly CURL="curl -s -u ${DIGITAL_OCEAN_TOKEN}:"

function debug() {
    echo "$@" >&2
}

function get_ssh_key_id() {
    id=$($CURL "https://api.digitalocean.com/v2/account/keys" \
        | $JSON ssh_keys \
        | $JSON -c "this.name === \"$1\"" \
        | $JSON 0.id)
    [[ -z "$id" ]] && exit 1
    echo "$id"
}

function create_droplet() {
    local ssh_key_id="$1"
    local box_name="$2"

    local image_region="sfo1"
    local ubuntu_image_slug="ubuntu-16-04-x64"
    local box_size="512mb"

    local data="{\"name\":\"${box_name}\",\"size\":\"${box_size}\",\"region\":\"${image_region}\",\"image\":\"${ubuntu_image_slug}\",\"ssh_keys\":[ \"${ssh_key_id}\" ],\"backups\":false}"

    id=$($CURL -X POST -H 'Content-Type: application/json' -d "${data}" "https://api.digitalocean.com/v2/droplets" | $JSON droplet.id)
    [[ -z "$id" ]] && exit 1
    echo "$id"
}

function get_droplet_ip() {
    local droplet_id="$1"
    ip=$($CURL "https://api.digitalocean.com/v2/droplets/${droplet_id}" | $JSON "droplet.networks.v4[0].ip_address")
    [[ -z "$ip" ]] && exit 1
    echo "$ip"
}

function get_droplet_id() {
    local droplet_name="$1"
    id=$($CURL "https://api.digitalocean.com/v2/droplets?per_page=100" | $JSON "droplets" | $JSON -c "this.name === '${droplet_name}'" | $JSON "[0].id")
    [[ -z "$id" ]] && exit 1
    echo "$id"  
}

function power_off_droplet() {
    local droplet_id="$1"
    local data='{"type":"power_off"}'
    local response=$($CURL -X POST -H 'Content-Type: application/json' -d "${data}" "https://api.digitalocean.com/v2/droplets/${droplet_id}/actions")
    local event_id=`echo "${response}" | $JSON action.id`

    if [[ -z "${event_id}" ]]; then
        debug "Got no event id, assuming already powered off."
        debug "Response: ${response}"
        return
    fi

    debug "Powered off droplet. Event id: ${event_id}"
    debug -n "Waiting for droplet to power off"

    while true; do
        local event_status=`$CURL "https://api.digitalocean.com/v2/droplets/${droplet_id}/actions/${event_id}" | $JSON action.status`
        if [[ "${event_status}" == "completed" ]]; then
            break
        fi
        debug -n "."
        sleep 10
    done
    debug ""
}

function power_on_droplet() {
    local droplet_id="$1"
    local data='{"type":"power_on"}'
    local event_id=`$CURL -X POST -H 'Content-Type: application/json' -d "${data}" "https://api.digitalocean.com/v2/droplets/${droplet_id}/actions" | $JSON action.id`

    debug "Powered on droplet. Event id: ${event_id}"

    if [[ -z "${event_id}" ]]; then
        debug "Got no event id, assuming already powered on"
        return
    fi

    debug -n "Waiting for droplet to power on"

    while true; do
        local event_status=`$CURL "https://api.digitalocean.com/v2/droplets/${droplet_id}/actions/${event_id}" | $JSON action.status`
        if [[ "${event_status}" == "completed" ]]; then
            break
        fi
        debug -n "."
        sleep 10
    done
    debug ""
}

function get_image_id() {
    local snapshot_name="$1"
    local image_id=""

    local response=$($CURL "https://api.digitalocean.com/v2/images?per_page=100")

    if ! image_id=$(echo "$response" \
       | $JSON images \
       | $JSON -c "this.name === \"${snapshot_name}\"" 0.id); then
        echo "Failed to parse curl response: ${response}"
    fi

    if [[ -z "${image_id}" ]]; then
        echo "Failed to get image id of ${snapshot_name}. reponse: ${response}"
        return 1
    fi

    echo "${image_id}"
}

function snapshot_droplet() {
    local droplet_id="$1"
    local snapshot_name="$2"
    local data="{\"type\":\"snapshot\",\"name\":\"${snapshot_name}\"}"
    local event_id=`$CURL -X POST -H 'Content-Type: application/json' -d "${data}" "https://api.digitalocean.com/v2/droplets/${droplet_id}/actions" | $JSON action.id`

    debug "Droplet snapshotted as ${snapshot_name}. Event id: ${event_id}"
    debug -n "Waiting for snapshot to complete"

    while true; do
        local event_status=`$CURL "https://api.digitalocean.com/v2/droplets/${droplet_id}/actions/${event_id}" | $JSON action.status`
        if [[ "${event_status}" == "completed" ]]; then
            break
        fi
        debug -n "."
        sleep 10
    done
    debug ""

    if ! image_id=$(get_image_id "${snapshot_name}"); then
        return 1
    fi
    echo "${image_id}"
}

function destroy_droplet() {
    local droplet_id="$1"
    # TODO: check for 204 status
    $CURL -X DELETE "https://api.digitalocean.com/v2/droplets/${droplet_id}"
    debug "Droplet destroyed"
    debug ""
}

function transfer_image() {
    local image_id="$1"
    local region_slug="$2"
    local data="{\"type\":\"transfer\",\"region\":\"${region_slug}\"}"
    local event_id=`$CURL -X POST -H 'Content-Type: application/json' -d "${data}" "https://api.digitalocean.com/v2/images/${image_id}/actions" | $JSON action.id`
    echo "${event_id}"
}

function wait_for_image_event() {
    local image_id="$1"
    local event_id="$2"

    debug -n "Waiting for ${event_id}"

    while true; do
        local event_status=`$CURL "https://api.digitalocean.com/v2/images/${image_id}/actions/${event_id}" | $JSON action.status`
        if [[ "${event_status}" == "completed" ]]; then
            break
        fi
        debug -n "."
        sleep 10
    done
    debug ""
}

function transfer_image_to_all_regions() {
    local image_id="$1"

    xfer_events=()
    image_regions=(ams3) ## sfo1 is where the image is created
    for image_region in ${image_regions[@]}; do
        xfer_event=$(transfer_image ${image_id} ${image_region})
        echo "Image transfer to ${image_region} initiated. Event id: ${xfer_event}"
        xfer_events+=("${xfer_event}")
        sleep 1
    done

    echo "Image transfer initiated, but they will take some time to get transferred."

    for xfer_event in ${xfer_events[@]}; do
        $vps wait_for_image_event "${image_id}" "${xfer_event}"
    done
}

if [[ $# -lt 1 ]]; then
    debug "<command> <params...>"
    exit 1
fi

case $1 in
get_ssh_key_id)
    get_ssh_key_id "${@:2}"
    ;;

create)
    create_droplet "${@:2}"
    ;;

get_id)
    get_droplet_id "${@:2}"
    ;;

get_ip)
    get_droplet_ip "${@:2}"
    ;;

power_on)
    power_on_droplet "${@:2}"
    ;;

power_off)
    power_off_droplet "${@:2}"
    ;;

snapshot)
    snapshot_droplet "${@:2}"
    ;;

destroy)
    destroy_droplet "${@:2}"
    ;;

transfer_image_to_all_regions)
    transfer_image_to_all_regions "${@:2}"
    ;;

*)
    echo "Unknown command $1"
    exit 1
esac
