'use strict';

var fs = require('fs'),
    debug = require('debug')('volume.js'),
    HttpError = require('../httperror'),
    encfs = require('../../node-encfs/index.js'),
    wrench = require('wrench'),
    path = require('path'),
    Repo = require('../repo'),
    debug = require('debug')('volume.js');

exports = module.exports = {
    initialize: initialize,
    listFiles: listFiles,
    listVolumes: listVolumes,
    createVolume: createVolume,
    deleteVolume: deleteVolume,
    mount: mount,
    unmount: unmount,
    attachRepo: attachRepo,
    attachVolume: attachVolume
};

var config, repos = { };

function resolveVolumeRootPath(volume) {
    return path.join(config.dataRoot, volume);
}

function resolveVolumeMountPoint(volume) {
    return path.join(config.mountRoot, volume);
}

function initialize(cfg, callback) {
    config = cfg;

    fs.readdir(config.dataRoot, function (error, files) {
        if (error) {
            return callback(new Error('Unable to read root folder'));
        }

        files.forEach(function (file) {
            var volumeMountPoint = resolveVolumeMountPoint(file) ;
            var tmpDir = path.join(volumeMountPoint, 'tmp');
            var repo = new Repo({ rootDir: volumeMountPoint, tmpDir: tmpDir });
            repos[file] = repo;
            debug('Detected repo : ' + file);
        });

        callback();
    });
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

                    delete repos[req.params[0]];
                    // TODO how to handle any errors in folder deletion?
                    res.send(200);
                });
            });
        });
    });
}

function listVolumes(req, res, next) {
    var tmp = [ ];
    for (var repoId in repos) {
        tmp.push({ name: repoId, id: repoId });
    }
    res.send(200, tmp);
}

function createVolume(req, res, next) {
    if (!req.body.name) {
        return next(new HttpError(400, 'volume name not specified'));
    }

    if (req.body.name in repos) {
        return next(new HttpError(409, 'volume already exists'));
    }

    var volumeRoot = resolveVolumeRootPath(req.body.name);
    var volumeMountPoint = resolveVolumeMountPoint(req.body.name);

    encfs.create(volumeRoot, volumeMountPoint, 'foobar1337', function (error, result) {
        if (error) {
            console.log('Creating volume failed:', error);
            return next(new HttpError(500, 'volume creation failed: ' + error));
        }

        var tmpDir = path.join(volumeMountPoint, 'tmp');
        fs.mkdirSync(tmpDir);

        // ## move this to repo
        var repo = new Repo({ rootDir: volumeMountPoint, tmpDir: tmpDir });
        repo.create({ name: 'nobody', email: 'somebody@like.me' }, function (error) {
            if (error) return next(new HttpError(500, 'Error creating repo in volume'));
            repo.addFile('README.md', { contents: 'README' }, function (error, commit) {
                if (error) return next(new HttpError(500, 'Error adding README: ' + error));
                repos[req.body.name] = repo;
                res.send(201);
            });
        });
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

        res.send(200, ret);
    });
}

function mount(req, res, next) {
    // TODO
}

function unmount(req, res, next) {
    // TODO
}

function attachRepo(req, res, next, volumeId) {
    if (!volumeId) return next(400, new HttpError('Volume not specified'));

    req.repo = repos[volumeId];
    if (!req.repo) return next(new HttpError(404, 'No such repo'));

    next();
}

function attachVolume(req, res, next, volumeId) {
    if (!volumeId) return next(400, new HttpError('Volume not specified'));
    if (!req.repo) return next(new HttpError(404, 'No such repo'));

    // FIXME: volume should become an object and route code should just use it
    req.volume = { tmpDir: path.join(resolveVolumeMountPoint(volumeId), 'tmp') };
    next();
}

