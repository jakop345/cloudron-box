'use strict';

var fs = require('fs'),
    debug = require('debug')('volume.js'),
    HttpError = require('../httperror'),
    encfs = require('../../node-encfs/index.js'),
    wrench = require('wrench'),
    path = require('path'),
    Repo = require('../repo');

exports = module.exports = {
    initialize: initialize,
    listFiles: listFiles,
    listVolumes: listVolumes,
    createVolume: createVolume,
    deleteVolume: deleteVolume,
    mount: mount,
    unmount: unmount,
    attachRepo: attachRepo
};

var config;

function initialize(cfg) {
    config = cfg;
}

function resolveVolumeRootPath(volume) {
    return path.join(config.dataRoot, volume);
}

function resolveVolumeMountPoint(volume) {
    return path.join(config.mountRoot, volume);
}

// TODO maybe also check for password?
function deleteVolume(req, res, next) {
    if (!req.params[0]) {
        return next(new HttpError(400, 'volume name not specified'));
    }

    var rootPath = resolveVolumeRootPath(req.params[0]);
    var mountPoint = resolveVolumeMountPoint(req.params[0]);

    fs.exists(rootPath, function (exists) {
        if (!exists) {
            return next(new HttpError(404, 'No such volume'));
        }

        var volume = new encfs.Root(rootPath, mountPoint);
        volume.unmount(function (error) {
            if (error) {
                console.log('Error unmounting the volume.', error);
            }

            wrench.rmdirRecursive(rootPath, function (error) {
                if (error) {
                    console.log('Failed to delete volume root path.', error);
                }

                wrench.rmdirRecursive(mountPoint, function (error) {
                    if (error) {
                        console.log('Failed to delete volume mount point.', error);
                    }

                    // TODO how to handle any errors in folder deletion?
                    res.send(200);
                });
            });
        });
    });
}

function listVolumes(req, res, next) {
    fs.readdir(config.dataRoot, function (error, files) {
        if (error) {
            return next(new HttpError(404, 'Unable to read root folder'));
        }

        var ret = [];

        files.forEach(function (file) {
            var tmp = {};
            tmp.name = file;
            tmp.id = file;

            ret.push(tmp);
        });

        res.send(JSON.stringify(ret));
    });
}

function createVolume(req, res, next) {
    // TODO check for existing volumes

    if (!req.body.name) {
        return next(new HttpError(400, 'volume name not specified'));
    }

    var volumeRoot = resolveVolumeRootPath(req.body.name);
    var volumeMountPoint = resolveVolumeMountPoint(req.body.name);

    encfs.create(volumeRoot, volumeMountPoint, 'foobar1337', function (error, result) {
        if (error) {
            console.log('Creating volume failed:', error);
            return next(new HttpError(400, 'volume creation failed: ' + error));
        }

        res.send(200);
    });
}

function listFiles(req, res, next) {
    req.params[0] = req.params[0] ? req.params[0] : '0';
    req.params[1] = req.params[1] ? req.params[1] : '.';

    var folder = path.join(resolveVolumeMountPoint(req.params[0]), req.params[1]);

    fs.readdir(folder, function (error, files) {
        if (error) {
            return next(new HttpError(404, 'Unable to read folder'));
        }

        var ret = [];

        if (folder !== resolveVolumeMountPoint(req.params[0])) {
            var dirUp = {};
            dirUp.filename = '..';
            dirUp.path = path.join(req.params[1], '..');
            dirUp.isDirectory = true;
            dirUp.isFile = false;
            dirUp.stat = { size: 0 };
            ret.push(dirUp);
        }

        files.forEach(function (file) {
            var tmp = {};
            tmp.filename = file;
            tmp.path = path.join(req.params[1], file);

            try {
                tmp.stat = fs.statSync(path.join(folder, file));
                tmp.isFile = tmp.stat.isFile();
                tmp.isDirectory = tmp.stat.isDirectory();
            } catch (e) {
                console.log('Error getting file information', e);
            }

            ret.push(tmp);
        });

        res.send(JSON.stringify(ret));
    });
}

function mount(req, res, next) {
    // TODO
}

function unmount(req, res, next) {
    // TODO
}

function attachRepo(req, res, next, volume) {
    if (!volume) return next(400, new HttpError('Volume not specified'));
    // FIXME: validate repo name and cache the repo objects per volume
    req.repo = new Repo({ root: resolveVolumeMountPoint(volume) });
    next();
}

