#!/bin/bash

set -eu -o pipefail

readonly BOX_SRC_DIR=/home/yellowtent/box
readonly DATA_DIR=/home/yellowtent/data

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly json="${script_dir}/../../node_modules/.bin/json"
readonly curl="curl --fail --connect-timeout 20 --retry 10 --retry-delay 2 --max-time 2400"

readonly is_update=$([[ -d "${BOX_SRC_DIR}" ]] && echo "yes" || echo "no")

# create a provision file for testing. %q escapes args. %q is reused as much as necessary to satisfy $@
(echo -e "#!/bin/bash\n"; printf "%q " "${script_dir}/installer.sh" "$@") > /home/yellowtent/provision.sh
chmod +x /home/yellowtent/provision.sh

arg_source_tarball_url=""
arg_data=""

args=$(getopt -o "" -l "sourcetarballurl:,data:" -n "$0" -- "$@")
eval set -- "${args}"

while true; do
    case "$1" in
    --sourcetarballurl) arg_source_tarball_url="$2";;
    --data) arg_data="$2";;
    --) break;;
    *) echo "Unknown option $1"; exit 1;;
    esac

    shift 2
done

box_src_tmp_dir=$(mktemp -dt box-src-XXXXXX)
echo "Downloading box code from ${arg_source_tarball_url} to ${box_src_tmp_dir}"

while true; do
    if $curl -L "${arg_source_tarball_url}" | tar -zxf - -C "${box_src_tmp_dir}"; then break; fi
    echo "Failed to download source tarball, trying again"
    sleep 5
done
(cd "${box_src_tmp_dir}" && npm rebuild)

if [[ "${is_update}" == "yes" ]]; then
    echo "Setting up update splash screen"
    "${box_src_tmp_dir}/setup/splashpage.sh" --data "${arg_data}" # show splash from new code
    ${BOX_SRC_DIR}/setup/stop.sh # stop the old code
fi

# switch the codes
rm -rf "${BOX_SRC_DIR}"
mv "${box_src_tmp_dir}" "${BOX_SRC_DIR}"
chown -R yellowtent.yellowtent "${BOX_SRC_DIR}"

# create a start file for testing. %q escapes args
(echo -e "#!/bin/bash\n"; printf "%q " "${BOX_SRC_DIR}/setup/start.sh" --data "${arg_data}") > /home/yellowtent/setup_start.sh
chmod +x /home/yellowtent/setup_start.sh

echo "Calling box setup script"
"${BOX_SRC_DIR}/setup/start.sh" --data "${arg_data}"

