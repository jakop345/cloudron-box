#!/bin/bash

# set -x
set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd )"
JSON="$SOURCE_DIR/node_modules/.bin/json"

VERSIONS_URL="https://s3.amazonaws.com/cloudron-releases/versions-dev.json"
VERSIONS_S3_URL="s3://cloudron-releases/versions-dev.json"

SOURCE_TARBALL_URL=""
IMAGE_ID=""

# --code and--image is provided for readability. The code below assumes number is an image id
# and anything else is the source tarball url. So, one can just say "publish.sh 2345 https://foo.tar.gz"
ARGS=$(getopt -o "" -l "dev,stable,code:,image:" -n "$0" -- "$@")
eval set -- "$ARGS"

while true; do
    case "$1" in
    --dev) VERSIONS_URL="https://s3.amazonaws.com/cloudron-releases/versions-dev.json";;
    --stable) echo "Not implemented yet. Need to figure how to bump version"; exit 1;;
    --code) SOURCE_TARBALL_URL="$2";;
    --image) IMAGE_ID="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

shift $(expr $OPTIND - 1)

while test $# -gt 0; do
    if [ "$1" -eq "$1" ] 2>/dev/null; then IMAGE_ID="$1"; else SOURCE_TARBALL_URL="$1"; fi # -eq detects integers
    shift
done

if [[ -z "$SOURCE_TARBALL_URL" && -z "$IMAGE_ID" ]]; then
    echo "--code or --image is required"
    exit 1
fi

NEW_VERSIONS_FILE=$(mktemp)
wget -q -O "$NEW_VERSIONS_FILE" "$VERSIONS_URL"
LAST_VERSION=$(cat "$NEW_VERSIONS_FILE" | $JSON -ka | tail -n 1)
if [ -z "$SOURCE_TARBALL_URL" ]; then
    SOURCE_TARBALL_URL=$($JSON -f "$NEW_VERSIONS_FILE" -D, "$LAST_VERSION,sourceTarballUrl")
    echo "Using the previous code url : $SOURCE_TARBALL_URL"
fi
if [ -z "$IMAGE_ID" ]; then
    IMAGE_ID=$($JSON -f "$NEW_VERSIONS_FILE" -D, "$LAST_VERSION,imageId")
    echo "Using the previous image id : $IMAGE_ID"
fi


NEW_VERSION=$($SOURCE_DIR/node_modules/.bin/semver -i $LAST_VERSION)

echo "Releasing version $NEW_VERSION"
$JSON -q -I -f "$NEW_VERSIONS_FILE" -e "this['$LAST_VERSION'].next = '$NEW_VERSION'"
$JSON -q -I -f "$NEW_VERSIONS_FILE" -e "this['$NEW_VERSION'] = { 'sourceTarballUrl': '$SOURCE_TARBALL_URL', 'imageId': $IMAGE_ID, 'next': null }"

echo "Verifying new versions file"
$SOURCE_DIR/release/verify.js "$NEW_VERSIONS_FILE"

echo "Uploading new versions file"
$SOURCE_DIR/node_modules/.bin/s3-cli put --acl-public "$NEW_VERSIONS_FILE" "$VERSIONS_S3_URL"

cat "$NEW_VERSIONS_FILE"
rm "$NEW_VERSIONS_FILE"

