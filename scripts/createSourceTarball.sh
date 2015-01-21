#!/bin/bash

# set -x
set -e

[[ ! -f "${HOME}/.s3cfg" ]] && echo "~/.s3cfg missing" && exit 1

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
readonly TMPDIR=${TMPDIR:-/tmp} # why is this not set on mint?

readonly version=$(cd "${SOURCE_DIR}" && git rev-parse HEAD)
readonly bundle_dir=$(mktemp -d -t box 2>/dev/null || mktemp -d box-XXXXXXXXXX --tmpdir=$TMPDIR)
readonly bundle_file="${TMPDIR}/box-${version}.tar.gz"

chmod "o+rx,g+rx" "${bundle_dir}" # otherwise extracted tarball director won't be readable by others/group
echo "Checking out code [${version}] into ${bundle_dir}"
(cd "${SOURCE_DIR}" && git archive --format=tar HEAD | (cd "${bundle_dir}" && tar xf -))

echo "Installing modules"
cd "${bundle_dir}" && npm install --production

cd "${bundle_dir}" && tar czvf "${bundle_file}" .

echo "Uploading bundle to S3"
${SOURCE_DIR}/node_modules/.bin/s3-cli put --acl-public "${bundle_file}" "s3://cloudron-releases/box-${version}.tar.gz"

echo "Cleaning up ${bundle_dir}"
rm -rf "${bundle_dir}" "${bundle_file}"

