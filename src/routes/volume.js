'use strict';

var HttpError = require('../httperror.js'),
    HttpSuccess = require('../httpsuccess.js'),
    async = require('async'),
    volume = require('../volume.js'),
    User = require('../user.js'),
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
    requireMountedVolume: requireMountedVolume,
    listUsers: listUsers,
    addUser: addUser,
    removeUser: removeUser
};

var config;

function initialize(cfg) {
    config = cfg;
}

function deleteVolume(req, res, next) {
    req.volume.verifyUser(req.user, req.body.password, function (error) {
        if (error && error.reason === VolumeError.WRONG_USER_PASSWORD) return next(new HttpError(403, 'Wrong password'));
        if (error && error.reason === VolumeError.NO_SUCH_USER) return next(new HttpError(403, 'User has no access to volume'));
        if (error) return next(new HttpError(500));

        req.volume.destroy(function (error) {
            if (error) return next(new HttpError(500, 'Unable to destroy volume: ' + error));

            delete req.volume;
            next(new HttpSuccess(200, {}));
        });
    });
}

function listVolumes(req, res, next) {
    volume.list(req.user.username, config, function (error, result) {
        if (error) {
            return next(new HttpError(500, 'Unable to list volumes: ' + error));
        }

        async.map(result, function (volume, callback) {
            var ret = {};
            ret.name = volume.name();
            ret.id = volume.id;

            volume.isMounted(function (error, result) {
                if (error) return callback(error);
                ret.isMounted = result;

                volume.users(function (error, result) {
                    if (error) return callback(error);
                    ret.users = result;

                    callback(null, ret);
                });
            });
        }, function (error, results) {
            if (error) return next(new HttpError(500, 'Unable to list volumes'));
            next(new HttpSuccess(200, { volumes: results }));
        });
    });
}

function createVolume(req, res, next) {
    if (!req.body.name) {
        return next(new HttpError(400, 'New volume name not specified'));
    }

    volume.get(req.body.name, req.user.username, config, function (error, result) {
        if (result) next(new HttpError(409, 'Volume already exists'));

        User.verify(req.user.username, req.body.password, function (error, result) {
            if (error) {
                if (error.reason === User.UserError.WRONG_USER_OR_PASSWORD) {
                    return next(new HttpError(403, 'Wrong password'));
                }
                return next(new HttpError(500, 'Internal server error'));
            }

            volume.create(req.body.name, result, req.body.password, config, function (error, result) {
                if (error) return next(new HttpError(500, 'Volume creation failed: ' + error));

                var ret = {};
                ret.name = result.name();
                ret.id = result.id;

                next(new HttpSuccess(201, ret));
            });
        });
    });
}

function listFiles(req, res, next) {
    // TODO this is unsafe params index might change - Johannes
    var directory = req.params[0] || '';

    req.volume.listFiles(directory, function (error, files) {
        if (error && error.reason === VolumeError.READ_ERROR) {
            return next(new HttpError(404, 'Unable to read folder'));
        } else if (error && error.reason === VolumeError.NOT_MOUNTED) {
            return next(new HttpError(401, 'Volume not mounted'));
        } else if (error) {
            return next(new HttpError(500, 'Internal server error'));
        }

        next(new HttpSuccess(200, files));
    });
}

function mount(req, res, next) {
    req.volume.open(req.user.username, req.body.password, function (error) {
        if (error) {
            if (error.reason === VolumeError.WRONG_USER_PASSWORD) {
                return next(new HttpError(403, 'Wrong password'));
            }

            return next(new HttpError(402, 'Unable to open volume'));
        }
        next(new HttpSuccess(200, {}));
    });
}

function unmount(req, res, next) {
    req.volume.close(function (error) {
        if (error) return next(new HttpError(500, 'Unable to close volume'));
        next(new HttpSuccess(200, {}));
    });
}

function isMounted(req, res, next) {
    req.volume.isMounted(function (error, mounted) {
        if (error) return next(new HttpError(500, 'Unable to check if volume is mounted'));
        next(new HttpSuccess(200, { mounted: mounted }));
    });
}

function attachVolume(req, res, next, volumeId) {
    if (!volumeId) return next(new HttpError(400, 'Volume not specified'));

    volume.get(volumeId, req.user.username, config, function (error, result) {
        if (error) return next(new HttpError(404, 'No such volume'));
        req.volume = result;
        next();
    });
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

function listUsers(req, res, next) {
    req.volume.users(function (error, result) {
        if (error) return next(new HttpError(500, 'Unable to list volume users'));
        next(new HttpSuccess(200, { users: result }));
    });
}

function addUser(req, res, next) {
    if (!req.body.username) return next(new HttpError(400, 'New volume username not provided'));
    if (!req.body.password) return next(new HttpError(400, 'User password not provided'));

    User.get(req.body.username, function (error, result) {
        if (error) return next(new HttpError(405, 'User not found'));

        req.volume.addUser(result, req.user, req.body.password, function (error) {
            if (error && error.reason === VolumeError.WRONG_USER_PASSWORD) return next(new HttpError(401, 'Wrong password'));
            if (error) return next(new HttpError(500));
            next(new HttpSuccess(200, {}));
        });
    });
}

/*
 removeUser()

 Removes the provided user from the volume if the user has access to the volume
 It also deletes the volume if the last user gets removed!

 Requires
   - password of current user for confirmation
   - username of user to delete
*/
function removeUser(req, res, next) {
    if (!req.headers.password) return next(new HttpError(400, 'User password not provided'));

    User.verify(req.user.username, req.headers.password, function (error) {
        if (error) return next(new HttpError(401, 'Wrong password'));

        User.get(req.params.username, function (error, result) {
            if (error) return next(new HttpError(405, 'User not found'));

            req.volume.removeUser(result, function (error) {
                if (error) return next(new HttpError(401, 'User does not have access to volume'));

                req.volume.users(function (error, result) {
                    if (error) return next(new HttpError(500));

                    // remove the volume only if we removed the last user of this volume
                    if (result.length >= 1) return next(new HttpSuccess(200, {}));

                    req.volume.destroy(function (error) {
                        if (error) {
                            if (error.reason === VolumeError.WRONG_USER_PASSWORD) {
                                return next(new HttpError(403, 'Wrong password'));
                            }

                            return next(new HttpError(500, 'Unable to destroy volume: ' + error));
                        }

                        delete req.volume;
                        next(new HttpSuccess(200, {}));
                    });
                });
            });
        });
    });
}
