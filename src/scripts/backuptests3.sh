#!/bin/bash

set -eu -o pipefail

readonly s3_url="$1"
export AWS_ACCESS_KEY_ID="$2"
export AWS_SECRET_ACCESS_KEY="$3"
export AWS_DEFAULT_REGION="$4"

echo "Test Content" | aws s3 cp - "${s3_url}"

aws s3 rm "${s3_url}"
