#!/bin/bash

# set -x
set -e

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
readonly JSON="${SOURCE_DIR}/node_modules/.bin/json"
[ $(uname -s) == "Darwin" ] && GNU_GETOPT="/usr/local/opt/gnu-getopt/bin/getopt" || GNU_GETOPT="getopt"
readonly GNU_GETOPT

readonly VERSIONS_URL="https://s3.amazonaws.com/cloudron-releases/versions-dev.json"
readonly VERSIONS_S3_URL="s3://cloudron-releases/versions-dev.json"

if [[ ! -f "${SOURCE_DIR}/../installer/scripts/digitalOceanFunctions.sh" ]]; then
    echo "Could not locate digitalOceanFunctions.sh"
    exit 1
fi

source "${SOURCE_DIR}/../installer/scripts/digitalOceanFunctions.sh"

new_versions_file=""
source_tarball_url=""
image_id=""
cmd=""
new_version=""
changelog="If I told you, I'd have to kill you"

# --code and--image is provided for readability. The code below assumes number is an image id
# and anything else is the source tarball url. So, one can just say "publish.sh 2345 https://foo.tar.gz"
args=$($GNU_GETOPT -o "" -l "dev,stable,code:,image:,rerelease,new,list,revert,changelog:,release:" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --dev) shift;;
    --stable) echo "Not implemented yet. Need to figure how to bump version"; exit 1;;
    --code) source_tarball_url="$2"; shift 2;;
    --image) image_id="$2"; shift 2;;
    --rerelease) cmd="rerelease"; shift;;
    --new) cmd="new"; shift;;
    --release) cmd="release"; new_versions_file="$2"; shift 2;;
    --list) cmd="list"; shift;;
    --revert) cmd="revert"; shift;;
    --changelog) changelog="$2"; shift 2;;
    --) shift; break;;
    *) echo "Unknown option $2"; exit;;
    esac
done

shift $(expr $OPTIND - 1)

download_current() {
    # download the existing version file if the user hasn't provided one
    local current_versions_file=$(mktemp -t box-versions 2>/dev/null || mktemp)

    if ! wget -q -O "${current_versions_file}" "${VERSIONS_URL}"; then
        echo "Error downloading versions file"
        exit 1
    fi

    echo "${current_versions_file}"
}

if [[ "${cmd}" == "list" ]]; then
    cat "$(download_current)"
    exit 0
elif [[ "${cmd}" == "release" ]]; then
    if [[ ! -f "${new_versions_file}" ]]; then
        echo "${new_versions_file} cannot be found"
        exit 1
    fi
elif [[ "${cmd}" == "new" ]]; then
    if [[ -z "${source_tarball_url}" || -z "${image_id}" ]]; then
        echo "--code and --image is required"
        exit 1
    fi

    new_version="0.0.1"
    image_name=$(get_image_name "${image_id}")

    new_versions_file=$(mktemp -t box-versions 2>/dev/null || mktemp)
    cat > "${new_versions_file}" <<EOF
    {
        "0.0.1": {
            "sourceTarballUrl": "${source_tarball_url}",
            "imageId": ${image_id},
            "imageName": "${image_name}",
            "changelog": [ "Let's start at the very beginning, a very good way to start" ],
            "next": null
        }
    }
EOF
elif [[ "${cmd}" == "revert" ]]; then
    new_versions_file=$(download_current)
    last_version=$(cat "${new_versions_file}" | $JSON -ka | tail -n 1)
    second_last_version=$(cat "${new_versions_file}" | $JSON -ka | tail -n 2 | head -n 1)

    echo "Removing $last_version and making $second_last_version the last release"
    $JSON -q -I -f "${new_versions_file}" -e "delete this['${last_version}']"
    $JSON -q -I -f "${new_versions_file}" -e "this['${second_last_version}'].next = null"
else
    new_versions_file=$(download_current)
    # modify existing versions.json
    if [[ -z "${source_tarball_url}" && -z "${image_id}" && "${cmd}" != "rerelease" ]]; then
        echo "--code or --image is required"
        exit 1
    fi

    readonly last_version=$(cat "${new_versions_file}" | $JSON -ka | tail -n 1)
    if [[ -z "${source_tarball_url}" ]]; then
        source_tarball_url=$($JSON -f "${new_versions_file}" -D, "${last_version},sourceTarballUrl")
        echo "Using the previous code url : ${source_tarball_url}"
    fi
    if [[ -z "${image_id}" ]]; then
        image_id=$($JSON -f "${new_versions_file}" -D, "${last_version},imageId")
        echo "Using the previous image id : ${image_id}"
    fi

    new_version=$($SOURCE_DIR/node_modules/.bin/semver -i "${last_version}")
    echo "Releasing version ${new_version}"
    image_name=$(get_image_name "${image_id}")

    $JSON -q -I -f "${new_versions_file}" -e "this['${last_version}'].next = '${new_version}'"
    $JSON -q -I -f "${new_versions_file}" -e "this['${new_version}'] = { 'sourceTarballUrl': '${source_tarball_url}', 'imageId': ${image_id}, 'imageName': '${image_name}', 'changelog': [ '${changelog}' ], 'next': null }"
fi

echo "Verifying new versions file"
$SOURCE_DIR/release/verify.js "${new_versions_file}"

echo "Uploading new versions file"
$SOURCE_DIR/node_modules/.bin/s3-cli put --acl-public --default-mime-type "application/json" "${new_versions_file}" "${VERSIONS_S3_URL}"

cat "${new_versions_file}"

