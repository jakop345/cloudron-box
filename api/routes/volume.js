'use strict';

var HttpError = require('../httperror'),
    volume = require('../volume.js'),
    VolumeError = volume.VolumeError;

exports = module.exports = {
    initialize: initialize,
    listFiles: listFiles,
    listVolumes: listVolumes,
    createVolume: createVolume,
    deleteVolume: deleteVolume,
    mount: mount,
    unmount: unmount,
    isMounted: isMounted,
    attachVolume: attachVolume,
    requireMountedVolume: requireMountedVolume
};

var config;

function initialize(cfg) {
    config = cfg;
}

function deleteVolume(req, res, next) {
    req.volume.destroy(function (error) {
        if (error) {
            return next(new HttpError(500, 'Unable to destroy volume: ' + error));
        }

        delete req.volume;
        res.send(200, {}) ;
    });
}

function listVolumes(req, res, next) {
    volume.list(req.user.username, config, function (error, result) {
        if (error) {
            return next(new HttpError(500, 'Unable to list volumes: ' + error));
        }

        res.send(200, result);
    });
}

function createVolume(req, res, next) {
    if (!req.body.name) {
        return next(new HttpError(400, 'New volume name not specified'));
    }

    if (volume.get(req.body.name, req.user.username, config)) {
        return next(new HttpError(409, 'Volume already exists'));
    }

    volume.create(req.body.name, req.user, config, function (error, result) {
        if (error) {
            return next(new HttpError(500, 'Volume creation failed: ' + error));
        }

        res.send(201, {});
    });
}

function listFiles(req, res, next) {
    // TODO this is unsafe params index might change - Johannes
    var directory = req.params[0] ? req.params[0] : '.';

    req.volume.listFiles(directory, function (error, files) {
        if (error && error.reason === VolumeError.READ_ERROR) {
            return next(new HttpError(404, 'Unable to read folder'));
        } else if (error && error.reason === VolumeError.NOT_MOUNTED) {
            return next(new HttpError(401, 'Volume not mounted'));
        } else if (error) {
            return next(new HttpError(500, 'Internal server error'));
        }

        res.send(200, files);
    });
}

function mount(req, res, next) {
    req.volume.open(req.user.username, req.body.password, function (error) {
        if (error) {
            return next(new HttpError(402, 'Unable to open volume'));
        }

        res.send(200, {});
    });
}

function unmount(req, res, next) {
    req.volume.close(function (error) {
        if (error) {
            return next(new HttpError(500, 'Unable to close volume'));
        }

        res.send(200, {});
    });
}

function isMounted(req, res, next) {
    req.volume.isMounted(function (error, mounted) {
        if (error) {
            return next(new HttpError(500, 'Unable to check if volume is mounted'));
        }

        res.send(200, { mounted: mounted });
    });
}

function attachVolume(req, res, next, volumeId) {
    if (!volumeId) return next(new HttpError(400, 'Volume not specified'));

    req.volume = volume.get(volumeId, req.user.username, config);

    if (!req.volume) return next(new HttpError(404, 'No such volume'));

    next();
}

function requireMountedVolume(req, res, next) {
    req.volume.isMounted(function (error, isMounted) {
        if (error) {
            return next(new HttpError(500, 'Unable to check volume mount state'));
        }

        if (!isMounted) {
            return next(new HttpError(405, 'Volume not mounted'));
        }

        next();
    });
}
