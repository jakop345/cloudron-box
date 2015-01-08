#!/bin/bash

SRCDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

# checks if all scripts are sudo access
scripts=($SRCDIR/src/scripts/rmappdir.sh \
         $SRCDIR/src/scripts/reloadnginx.sh \
         $SRCDIR/src/scripts/backup.sh \
         $SRCDIR/src/scripts/reboot.sh \
         $SRCDIR/src/scripts/reloadcollectd.sh)

for script in "${scripts[@]}"; do
    OUTPUT=$(sudo -n "$script" --check 2>/dev/null)
    # echo "$script: $OUTPUT"
    if [ "$OUTPUT" != "OK" ]; then
        echo "$script does not have sudo access"
        exit 1
    fi
done

if ! docker inspect girish/test:0.6 >/dev/null 2>/dev/null; then
    echo "docker pull girish/test:0.6 for tests to run"
    exit 1
fi

if ! docker inspect girish/redis:0.1 >/dev/null 2>/dev/null; then
    echo "docker pull girish/redis:0.1 for tests to run"
    exit 1
fi

exit 0
