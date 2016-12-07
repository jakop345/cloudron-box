#!/bin/bash

set -eu -o pipefail

if [[ $EUID -ne 0 ]]; then
    echo "This script should be run as root." >&2
    exit 1
fi

if [[ $# == 1 && "$1" == "--check" ]]; then
    echo "OK"
    exit 0
fi


# verify argument count
if [[ "$1" == "s3" && $# -lt 7 ]]; then
    echo "Usage: backupbox.sh s3 <s3 url> <access key id> <access key> <region> <endpoint> <password> [session token]"
    exit 1
fi

if [[ "$1" == "filesystem" && $# -lt 4 ]]; then
    echo "Usage: backupbox.sh filesystem <backupFolder> <fileName> <password>"
    exit 1
fi

# extract arguments
if [[ "$1" == "s3" ]]; then
    # env vars used by the awscli
    readonly s3_url="$2"
    export AWS_ACCESS_KEY_ID="$3"
    export AWS_SECRET_ACCESS_KEY="$4"
    export AWS_DEFAULT_REGION="$5"
    readonly endpoint_url="$6"
    readonly password="$7"

    if [ $# -gt 7 ]; then
        export AWS_SESSION_TOKEN="$8"
    fi
fi

if [[ "$1" == "filesystem" ]]; then
    readonly backup_folder="$2"
    readonly backup_fileName="$3"
    readonly password="$4"
fi

# perform backup
now=$(date "+%Y-%m-%dT%H:%M:%S")
BOX_DATA_DIR="${HOME}/data/box"
box_snapshot_dir="${HOME}/data/snapshots/box-${now}"

echo "Creating MySQL dump"
mysqldump -u root -ppassword --single-transaction --routines --triggers box > "${BOX_DATA_DIR}/box.mysqldump"

echo "Snapshoting backup as backup-${now}"
btrfs subvolume snapshot -r "${BOX_DATA_DIR}" "${box_snapshot_dir}"

# will be checked at the end
try=0

if [[ "$1" == "s3" ]]; then
    for try in `seq 1 5`; do
        echo "Uploading backup to ${s3_url} (try ${try})"
        error_log=$(mktemp)

        # may be empty
        optional_args=""
        if [ -n "${endpoint_url}" ]; then
            optional_args="--endpoint-url ${endpoint_url}"
        fi

        # use aws instead of curl because curl will always read entire stream memory to set Content-Length
        # aws will do multipart upload
        if tar -czf - -C "${box_snapshot_dir}" . \
               | openssl aes-256-cbc -e -pass "pass:${password}" \
               | aws ${optional_args} s3 cp - "${s3_url}" 2>"${error_log}"; then
            break
        fi
        cat "${error_log}" && rm "${error_log}"
    done
fi

if [[ "$1" == "filesystem" ]]; then
    echo "Storing backup to ${backup_folder}/${backup_fileName}"

    mkdir -p "${backup_folder}"

    tar -czf - -C "${box_snapshot_dir}" . | openssl aes-256-cbc -e -pass "pass:${password}" > "${backup_folder}/${backup_fileName}"
fi

echo "Deleting backup snapshot"
btrfs subvolume delete "${box_snapshot_dir}"

if [[ ${try} -eq 5 ]]; then
    echo "Backup failed"
    exit 3
else
    echo "Backup successful"
fi
