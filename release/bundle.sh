#!/bin/bash

set -x
set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd )"
VERSION=$(cd "$SOURCE_DIR" && git rev-parse HEAD)

# why is this not set on mint?
TMPDIR=${TMPDIR:-/tmp}

BUNDLE_DIR=$(mktemp -d -t box 2>/dev/null || mktemp -d box-XXXXXXXXXX --tmpdir=$TMPDIR)
echo "Checking out code [$VERSION] into $BUNDLE_DIR"
(cd "$SOURCE_DIR" && git archive --format=tar HEAD | (cd "$BUNDLE_DIR" && tar xf -))

echo "Installing modules"
cd "$BUNDLE_DIR" && npm install --production

BUNDLE_FILE="$TMPDIR/box-${VERSION}.tar.gz"
cd "$BUNDLE_DIR" && tar czvf "$BUNDLE_FILE" .

echo "Uploading bundle to S3"
$SOURCE_DIR/node_modules/.bin/s3-cli put --acl-public "$BUNDLE_FILE" "s3://cloudron-releases/box-${VERSION}.tar.gz"

echo "Cleaning up $BUNDLE_DIR"
rm -rf "$BUNDLE_DIR" "$BUNDLE_FILE"

