#!/usr/bin/env node

"use strict";

var encfs = require("./index.js");

encfs.create("test_root", "test_mnt", "foobar1337", function (error, result) {
    if (error) {
        console.log("Creating volume failed:", error);
        return;
    }

    console.log("Volume created:", result);

    result.unmount(function (error) {
        if (error) {
            console.log("Unable to unmount:", error);
            return;
        }

        console.log("Unmount succeeded");
        console.log("Now try to mount and unmount again.");

        result.mount("foobar1337", function (error) {
            if (error) {
                console.log("Unable to mount:", error);
                return;
            }

            console.log("Mount succeeded");

            result.unmount(function (error) {
                if (error) {
                    console.log("Unable to unmount:", error);
                    return;
                }

                console.log("Unmount succeeded");
                console.log("Done!");
            });
        });
    });
});