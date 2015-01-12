#!/bin/bash

# set -x
set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd )"
JSON="$SOURCE_DIR/node_modules/.bin/json"
[ $(uname -s) == "Darwin" ] && GNU_GETOPT="/usr/local/opt/gnu-getopt/bin/getopt" || GNU_GETOPT="getopt"

VERSIONS_URL="https://s3.amazonaws.com/cloudron-releases/versions-dev.json"
VERSIONS_S3_URL="s3://cloudron-releases/versions-dev.json"

SOURCE_TARBALL_URL=""
IMAGE_ID=""
FORCE="no"
RESET="no"

# --code and--image is provided for readability. The code below assumes number is an image id
# and anything else is the source tarball url. So, one can just say "publish.sh 2345 https://foo.tar.gz"
ARGS=$($GNU_GETOPT -o "" -l "dev,stable,code:,image:,force,reset" -n "$0" -- "$@")
eval set -- "$ARGS"

while true; do
    case "$1" in
    --dev) VERSIONS_URL="https://s3.amazonaws.com/cloudron-releases/versions-dev.json"; shift;;
    --stable) echo "Not implemented yet. Need to figure how to bump version"; exit 1;;
    --code) SOURCE_TARBALL_URL="$2"; shift 2;;
    --image) IMAGE_ID="$2"; shift 2;;
    --force) FORCE="yes"; shift;;
    --reset) RESET="yes"; shift;;
    --) shift; break;;
    *) echo "Unknown option $2"; exit;;
    esac
done

shift $(expr $OPTIND - 1)

while test $# -gt 0; do
    if [ "$1" -eq "$1" ] 2>/dev/null; then IMAGE_ID="$1"; else SOURCE_TARBALL_URL="$1"; fi # -eq detects integers
    shift
done

if [[ -z "$SOURCE_TARBALL_URL" && -z "$IMAGE_ID" && "$FORCE" == "no" ]]; then
    echo "--code or --image is required"
    exit 1
fi

NEW_VERSIONS_FILE=$(mktemp -t box-versions 2>/dev/null || mktemp)
if ! wget -q -O "$NEW_VERSIONS_FILE" "$VERSIONS_URL"; then
    echo "Error downloading versions file"
    exit 1
fi

LAST_VERSION=$(cat "$NEW_VERSIONS_FILE" | $JSON -ka | tail -n 1)
if [ -z "$SOURCE_TARBALL_URL" ]; then
    SOURCE_TARBALL_URL=$($JSON -f "$NEW_VERSIONS_FILE" -D, "$LAST_VERSION,sourceTarballUrl")
    echo "Using the previous code url : $SOURCE_TARBALL_URL"
fi
if [ -z "$IMAGE_ID" ]; then
    IMAGE_ID=$($JSON -f "$NEW_VERSIONS_FILE" -D, "$LAST_VERSION,imageId")
    echo "Using the previous image id : $IMAGE_ID"
fi

if [ "$RESET" == "no" ]; then
    NEW_VERSION=$($SOURCE_DIR/node_modules/.bin/semver -i $LAST_VERSION)
    $JSON -q -I -f "$NEW_VERSIONS_FILE" -e "this['$LAST_VERSION'].next = '$NEW_VERSION'"
    $JSON -q -I -f "$NEW_VERSIONS_FILE" -e "this['$NEW_VERSION'] = { 'sourceTarballUrl': '$SOURCE_TARBALL_URL', 'imageId': $IMAGE_ID, 'next': null }"
else
    NEW_VERSION="0.0.1"
    cat > "$NEW_VERSIONS_FILE" <<EOF
    {
        "0.0.1": {
            "sourceTarballUrl": "$SOURCE_TARBALL_URL",
            "imageId": $IMAGE_ID,
            "next": null
        }
    }
EOF
fi

echo "Releasing version $NEW_VERSION"

echo "Verifying new versions file"
$SOURCE_DIR/release/verify.js "$NEW_VERSIONS_FILE"

echo "Uploading new versions file"
$SOURCE_DIR/node_modules/.bin/s3-cli put --acl-public "$NEW_VERSIONS_FILE" "$VERSIONS_S3_URL"

cat "$NEW_VERSIONS_FILE"
rm "$NEW_VERSIONS_FILE"

