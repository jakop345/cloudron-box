#!/bin/sh

mount -l -t fuse.encfs | awk -F " " '{print "fusermount -u " $3}' | bash
