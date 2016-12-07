#!/bin/bash

set -eu -o pipefail

readonly s3_url="$1"
export AWS_ACCESS_KEY_ID="$2"
export AWS_SECRET_ACCESS_KEY="$3"
export AWS_DEFAULT_REGION="$4"
readonly endpoint_url="$5"

optional_args=""

if [ -n "${endpoint_url}" ]; then
	optional_args="--endpoint-url ${endpoint_url}"
fi

echo "Test Content" | aws ${optional_args} s3 cp - "${s3_url}"

aws ${optional_args} s3 rm "${s3_url}"
