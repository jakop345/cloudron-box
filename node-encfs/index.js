'use strict';

var assert = require("assert"),
    path = require("path"),
    mkdirp = require('mkdirp'),
    spawn = require("child_process").spawn;

exports = module.exports = {
    create: create,
    Root: Root
};

var ENCFS_CMD = "encfs";
var ENCFS_CMD_ARGS = ["--standard", "--stdinpass"];
var ENCFS_CTL = "encfsctl";

var FUSE_CMD = "fusermount";
var FUSE_CMD_UMOUNT_ARGS = ["-u"];

// Internal helper
function spawnProcess(process, args, callback) {
    var proc = spawn(process, args);

    proc.on("error", function (code, signal) {
        // console.log("Error", code, signal);
        callback({ code: code, signal: signal });
    });

    proc.on("exit", function (code, signal) {
        // console.log("Exit", code, signal);
        if (code !== 0) {
            return callback({ code: code, signal: signal });
        }

        return callback();
    });

    proc.stdout.on('data', function (data) {
        // console.log('stdout: ' + data);
    });

    proc.stderr.on('data', function (data) {
        // console.log('stderr: ' + data);
    });

    return proc.stdin;
}

// Internal helper
function createOrMount(root, password, callback) {
    var absRootPath = path.resolve(__dirname, root.rootPath);
    var absMountPoint = path.resolve(__dirname, root.mountPoint);

    var args = ENCFS_CMD_ARGS.concat([absRootPath, absMountPoint]);

    console.log(args);

    // The callbackWrapper makes sure we only call back once!
    var calledBack = false;
    function callbackWrapper(error) {
        if (calledBack) {
            return;
        }

        calledBack = true;
        callback(error);
    }

    var stdin = spawnProcess(ENCFS_CMD, args, function (error) {
        if (error) {
            return callbackWrapper(error);
        }

        callbackWrapper();
    });

    if (stdin) {
        try {
            stdin.write(password);
            stdin.end();
        } catch (e) {
            return callbackWrapper(e);
        }
    } else {
        return callbackWrapper("No stdin available");
    }
}

// creates a new encypted volume
// <- returns the newly created Root object in the callback's result
function create(rootPath, mountPoint, password, callback) {
    assert(typeof rootPath === "string", "1 argument must be a string");
    assert(typeof mountPoint === "string", "2 argument must be a string");
    assert(typeof password === "string", "3 argument must be a string");
    assert(typeof callback === "function", "4 argument must be a callback function");

    var absRootPath = path.resolve(__dirname, rootPath);
    var absMountPoint = path.resolve(__dirname, mountPoint);

    mkdirp(absRootPath, function (error) {
        if (error) {
            return callback(error);
        }

        mkdirp(absMountPoint, function (error) {
            if (error) {
                return callback(error);
            }

            var root = new Root(absRootPath, absMountPoint);

            createOrMount(root, password, function (error) {
                if (error) {
                    return callback(error);
                }

                return callback(null, root);
            });
        });
    });
}

function Root(rootPath, mountPoint) {
    assert(typeof rootPath === "string", "1 argument must be a string");
    assert(typeof mountPoint === "string", "2 argument must be a string");

    this.rootPath = rootPath;
    this.mountPoint = mountPoint;
}

Root.prototype.mount = function(password, callback) {
    assert(typeof password === "string", "1 argument must be a string");
    assert(typeof callback === "function", "2 argument must be a callback function");

    createOrMount(this, password, callback);
};

Root.prototype.unmount = function(callback) {
    assert(typeof callback === "function", "1 argument must be a callback function");

    var args = FUSE_CMD_UMOUNT_ARGS.concat([this.mountPoint]);

    spawnProcess(FUSE_CMD, args, callback);
};

Root.prototype.info = function(callback) {
    assert(typeof callback === "function", "1 argument must be a callback function");
};