#!/bin/bash

set -eu

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
readonly JSON="${SOURCE_DIR}/node_modules/.bin/json"
readonly SEMVER="${SOURCE_DIR}/node_modules/.bin/semver"
[ $(uname -s) == "Darwin" ] && GNU_GETOPT="/usr/local/opt/gnu-getopt/bin/getopt" || GNU_GETOPT="getopt"
readonly GNU_GETOPT

readonly VERSIONS_URL_DEV="https://s3.amazonaws.com/cloudron-releases/versions-dev.json"
readonly VERSIONS_URL_STAGING="https://s3.amazonaws.com/cloudron-releases/versions-staging.json"
readonly VERSIONS_S3_URL_STAGING="s3://cloudron-releases/versions-staging.json"

verify_tag() {
    tag="$1"
    git rev-parse --verify "tags/$1" 2>/dev/null 1>&2
}

download() {
    # download the existing version file if the user hasn't provided one
    local tmp_file=$(mktemp -t stage 2>/dev/null || mktemp)

    if wget -q -O "${tmp_file}" "${1}"; then
        echo "${tmp_file}"
    fi
}

read_changelog() {
    version="$1"
    changelog_file="${SOURCE_DIR}/release/CHANGES"

     # get change lines, remove comments, remove leading space and hyphen, quote the lines and join lines by comma
    $SOURCE_DIR/release/parse_changes.js "${version}" \
        | grep -v "^#"  \
        | sed 's/^[ -]*//' \
        | sed -e '/^$/d' -e 's/\(.*\)/"\1"/g' \
        | paste -d, - -
}

if [[ $# -lt 1 ]]; then
    echo "Usage: stage.sh <dev-version>"
    exit 1
fi

dev_version="$1"

dev_versions_file=$(download "${VERSIONS_URL_DEV}")
if [[ -z "${dev_versions_file}" ]]; then
    echo "Error downloading dev versions file"
    exit 1
fi

dev_version_info=$($JSON -f "${dev_versions_file}" -D, "${dev_version}")
if [[ -z "${dev_version_info}" ]]; then
    echo "No such version in dev ${dev_versions_file} ${dev_version}"
    exit 1
fi

staging_versions_file=$(download "${VERSIONS_URL_STAGING}") ## TODO: this can fail
if [[ -z "${staging_versions_file}" ]]; then
    echo "Creating new staging release file"
    staging_versions_file=$(mktemp -t stage 2>/dev/null || mktemp)
    echo "{}" > ${staging_versions_file}
    readonly staging_last_version="0.0.0"
    staging_new_version="0.0.1"
    upgrade="false"
else
    readonly staging_last_version=$(cat "${staging_versions_file}" | $JSON -ka | tail -n 1)
    staging_new_version=$($SEMVER -i "${staging_last_version}")
    $JSON -q -I -f "${staging_versions_file}" -e "this['${staging_last_version}'].next = '${staging_new_version}'"

    last_image_id=$($JSON -f "${staging_versions_file}" -D, "${staging_last_version},imageId")
    new_image_id=$($JSON -f "${dev_versions_file}" -D, "${dev_version},imageId")

    upgrade=$([[ "${last_image_id}" != "${new_image_id}" ]] && echo "true" || echo "false")
fi

#TODO: check if the tag matches the sha1 in the sourceTarballUrl
if ! verify_tag "v${staging_new_version}"; then
    echo "No git tag named v${staging_new_version} found"
    exit 1
fi

changelog=$(read_changelog "${staging_new_version}")
if [[ -z "${changelog}" ]]; then
    echo "Missing changelog file or empty change log"
    exit 1
fi

echo "Releasing version ${staging_new_version}"
$JSON -q -I -f "${staging_versions_file}" -e "this['${staging_new_version}'] = ${dev_version_info}"
echo "The changelog is ${changelog}"
$JSON -q -I -f "${staging_versions_file}" -e "this['${staging_new_version}'].changelog = [ ${changelog} ]"
$JSON -q -I -f "${staging_versions_file}" -e "this['${staging_new_version}'].upgrade = ${upgrade}"
$JSON -q -I -f "${staging_versions_file}" -e "this['${staging_new_version}'].date = '$(date -u)'"
$JSON -q -I -f "${staging_versions_file}" -e "this['${staging_new_version}'].next = null"

echo "Verifying new versions file"
$SOURCE_DIR/release/verify.js "${staging_versions_file}"

echo "Uploading new versions file"
$SOURCE_DIR/node_modules/.bin/s3-cli put --acl-public --default-mime-type "application/json" "${staging_versions_file}" "${VERSIONS_S3_URL_STAGING}"

cat "${staging_versions_file}" | tee $SOURCE_DIR/release/versions-staging.json

