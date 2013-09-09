'use strict';

var HttpError = require('../httperror'),
    user = require('../user.js'),
    volume = require('../volume.js');

exports = module.exports = {
    initialize: initialize,
    listFiles: listFiles,
    listVolumes: listVolumes,
    createVolume: createVolume,
    deleteVolume: deleteVolume,
    mount: mount,
    unmount: unmount,
    attachVolume: attachVolume
};

var config;

function initialize(cfg) {
    config = cfg;
}

// TODO maybe also check for password? - Johannes
function deleteVolume(req, res, next) {
    if (!req.volume) return next(new HttpError(404, 'No such volume'));

    req.volume.destroy(function (error) {
        if (error) {
            return next(new HttpError(500, 'Unable to destroy volume: ' + error));
        }

        delete req.volume;
        res.send(200) ;
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

    if (!req.user.password) {
        return next(new HttpError(400, 'Password not specified'));
    }

    user.verify(req.user.username, req.user.password, function (error, result) {
        if (error) {
            return next(new HttpError(401, 'Wrong password entered'));
        }

        if (volume.get(req.body.name, req.user.username, config)) {
            return next(new HttpError(409, 'Volume already exists'));
        }

        volume.create(req.body.name, req.user.username, req.user.email, req.user.password, config, function (error, result) {
            if (error) {
                return next(new HttpError(500, 'Volume creation failed: ' + error));
            }

            res.send(201);
        });
    });
}

function listFiles(req, res, next) {
    if (!req.volume) return next(new HttpError(404, 'No such volume'));

    // TODO this is unsafe params index might change - Johannes
    var directory = req.params[0] ? req.params[0] : '.';

    req.volume.listFiles(directory, function (error, files) {
        if (error) {
            return next(new HttpError(404, 'Unable to read folder'));
        }

        res.send(200, files);
    });
}

function mount(req, res, next) {
    // TODO
}

function unmount(req, res, next) {
    // TODO
}

function attachVolume(req, res, next, volumeId) {
    if (!volumeId) return next(new HttpError(400, 'Volume not specified'));

    req.volume = volume.get(volumeId, req.user.username, config);

    if (!req.volume) return next(new HttpError(404, 'No such volume'));

    next();
}

