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
    $CURL "https://api.digitalocean.com/v2/account/keys" \
        | $JSON ssh_keys \
        | $JSON -c "this.name === \"$1\"" \
        | $JSON 0.id
}

function create_droplet() {
    local ssh_key_id="$1"
    local box_name="$2"

    local image_region="sfo1"
    local ubuntu_image_slug="ubuntu-15-04-x64" # id=12658446
    local box_size="512mb"

    local data="{\"name\":\"${box_name}\",\"size\":\"${box_size}\",\"region\":\"${image_region}\",\"image\":\"${ubuntu_image_slug}\",\"ssh_keys\":[ \"${ssh_key_id}\" ],\"backups\":false}"

    $CURL -X POST -H 'Content-Type: application/json' -d "${data}" "https://api.digitalocean.com/v2/droplets" | $JSON droplet.id
}

function get_droplet_ip() {
    local droplet_id="$1"
    $CURL "https://api.digitalocean.com/v2/droplets/${droplet_id}" | $JSON "droplet.networks.v4[0].ip_address"
}

function get_droplet_id() {
    local droplet_name="$1"
    $CURL "https://api.digitalocean.com/v2/droplets?per_page=100" | $JSON "droplets" | $JSON -c "this.name === '${droplet_name}'" | $JSON "[0].id"
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

function get_image_id() {
    local snapshot_name="$1"
    local image_id=""

    image_id=$($CURL "https://api.digitalocean.com/v2/images?per_page=100" \
       | $JSON images \
       | $JSON -c "this.name === \"${snapshot_name}\"" 0.id)

    if [[ -n "${image_id}" ]]; then
        echo "${image_id}"
    fi
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

wait_for_image_event)
    wait_for_image_event "${@:2}"
    ;;

get_image_id)
    get_image_id "${@:2}"
    ;;

transfer_image)
    transfer_image "${@:2}"
    ;;

*)
    echo "Unknown command $1"
    exit 1
esac
