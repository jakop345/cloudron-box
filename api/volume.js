'use strict';

var fs = require('fs'),
    db = require('./database.js'),
    debug = require('debug')('volume.js'),
    encfs = require('encfs'),
    rimraf = require('rimraf'),
    path = require('path'),
    assert = require('assert'),
    crypto = require('crypto'),
    aes = require("aes-helper"),
    util = require('util'),
    HttpError = require('./httperror.js'),
    Repo = require('./repo.js');

exports = module.exports = {
    Volume: Volume,
    VolumeError: VolumeError,
    list: listVolumes,
    create: createVolume,
    destroy: destroyVolume,
    get: getVolume
};

var REPO_SUBFOLDER = 'repo';

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function VolumeError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = JSON.stringify(err);
    this.code = err ? err.code : null;
    this.reason = reason || VolumeError.INTERNAL_ERROR;
    this.statusCode = 500; // any db error is a server error
}
util.inherits(VolumeError, Error);
VolumeError.INTERNAL_ERROR = 1;
VolumeError.NOT_MOUNTED = 2;
VolumeError.READ_ERROR = 3;
VolumeError.META_MISSING = 4;
VolumeError.NO_SUCH_VOLUME = 5;

// TODO is this even a good password generator? - Johannes
function generateNewVolumePassword() {
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()_+?{}[]|:;'~`<>,.-=";
    var charsLength = chars.length;
    var password = "";

    for (var i = 0; i < 64; ++i) {
        password += chars.charAt(Math.floor(Math.random() * charsLength));
    }

    return password;
}

function Volume(name, config) {
    this.name = name;
    this.config = config;
    this.dataPath = this._resolveVolumeRootPath();
    this.mountPoint = this._resolveVolumeMountPoint();
    this.tmpPath = path.join(this.mountPoint, 'tmp');
    this.encfs = new encfs.Root(this.dataPath, this.mountPoint);
    this.repo = undefined;
    this.meta = undefined;
}

Volume.prototype._resolveVolumeRootPath = function() {
    return path.join(this.config.dataRoot, this.name);
};

Volume.prototype._resolveVolumeMountPoint = function() {
    return path.join(this.config.mountRoot, this.name);
};

Volume.prototype._initMetaDatabase = function () {
    this.meta = new db.Table(this.dataPath + '/.meta', {
        username: { type: 'String', hashKey: true },
        passwordCypher: { type: 'String', priv: true }
    });
};

Volume.prototype.open = function(username, password, callback) {
    assert(typeof username === 'string');
    assert(username.length !== 0);
    assert(typeof password === 'string');
    assert(password.length !== 0);
    assert(typeof callback === 'function');

    var that = this;

    this._initMetaDatabase();

    this.encfs.isMounted(function (error, mounted) {
        if (error) {
            return callback(error);
        }

        if (mounted && that.repo) {
            return callback();
        }

        that.meta.get(username, function (error, record) {
            if (error) {
                debug('Unable to get user from meta db. ' + JSON.stringify(error));
                return callback(error);
            }

            var volPassword = aes.decrypt(record.passwordCypher, password);

            that.encfs.mount(volPassword, function (error, result) {
                if (error) {
                    return callback(error);
                }

                callback();
            });
        });
    });
};

Volume.prototype.close = function(callback) {
    assert(typeof callback === 'function');
    var that = this;

    this.encfs.isMounted(function (error, mounted) {
        if (error) {
            return callback(error);
        }

        if (!mounted) {
            return callback();
        }

        that.encfs.unmount(function (error, result) {
            if (error) {
                return callback(error);
            }

            callback();
        });
    });
};

// TODO this does not have error reporting yet - Johannes
Volume.prototype.destroy = function (callback) {
    assert(typeof callback === 'function');

    var that = this;

    function cleanupFolders() {
        rimraf(that.dataPath, function (error) {
            if (error) {
                console.log('Failed to delete volume root path.', error);
            }

            rimraf(that.mountPoint, function (error) {
                if (error) {
                    console.log('Failed to delete volume mount point.', error);
                }

                callback();
            });
        });
    }

    this.encfs.isMounted(function (error, mounted) {
        if (!mounted) {
            cleanupFolders();
            return;
        }

        that.encfs.unmount(function (error) {
            if (error) {
                console.log('Error unmounting the volume.', error);
            }

            cleanupFolders();
        });
    });
};

Volume.prototype.listFiles = function (directory, callback) {
    assert(typeof directory === 'string');
    assert(typeof callback === 'function');

    if (directory.length === 0) {
        directory = '.';
    }

    var that = this;
    var folder = path.join(this.mountPoint, REPO_SUBFOLDER, directory);

    this.encfs.isMounted(function (error, mounted) {
        if (error) {
            debug('Error checking if encfs for volume "' + that.name + '" is mounted.');
            return callback(error);
        }

        if (!mounted) {
            debug('Encfs for volume "' + that.name + '" is not mounted.');
            return callback(new VolumeError(null, VolumeError.NOT_MOUNTED));
        }

        fs.readdir(folder, function (error, files) {
            if (error) {
                debug('Unable to read directory "' + folder + '" for volume "' + that.name + '".');
                return callback(new VolumeError(error, VolumeError.READ_ERROR));
            }

            var ret = [];

            if (folder !== that.mountPoint) {
                var dirUp = {};
                dirUp.filename = '..';
                dirUp.path = path.join(directory, '..');
                dirUp.isDirectory = true;
                dirUp.isFile = false;
                dirUp.stat = { size: 0 };
                ret.push(dirUp);
            }

            files.forEach(function (file) {
                // filter .git
                if (file === '.git') {
                    return;
                }

                var tmp = {};
                tmp.filename = file;
                tmp.path = path.join(directory, file);

                try {
                    tmp.stat = fs.statSync(path.join(folder, file));
                    tmp.isFile = tmp.stat.isFile();
                    tmp.isDirectory = tmp.stat.isDirectory();
                } catch (e) {
                    debug('Error getting file information:' + JSON.stringify(e));
                }

                ret.push(tmp);
            });

            callback(null, ret);
        });
    });
};

Volume.prototype.addUser = function (user, password, callback) {
    if (!this.meta) {
        debug('Invalid volume "' + this.name + '". Misses the meta database.');
        return callback(new VolumeError(null, VolumeError.META_MISSING));
    }

    // TODO salt is currently fixed in aes-helper module - Johannes
    var record = {
        username: user.username,
        passwordCypher: aes.encrypt(password, user.password)
    };

    this.meta.put(record, function (error) {
        if (error) {
            debug('Unable to add user to meta db. ' + JSON.stringify(error));
            return callback(error);
        }

        return callback(null, record);
    });
};

Volume.prototype.removeUser = function (user, callback) {
    if (!this.meta) {
        debug('Invalid volume "' + this.name + '". Misses the meta database.');
        return callback(new VolumeError(null, VolumeError.META_MISSING));
    }

    this.meta.remove(user.username, callback);
};

function listVolumes(username, config, callback) {
    assert(typeof username === 'string');
    assert(username.length !== 0);
    assert(typeof callback === 'function');
    assert(typeof config === 'object');
    assert(config.dataRoot);
    assert(config.mountRoot);

    fs.readdir(config.dataRoot, function (error, files) {
        if (error) {
            debug('Unable to list volumes.' + JSON.stringify(error));
            return callback(new VolumeError(error, VolumeError.READ_ERROR));
        }

        var ret = [];

        files.forEach(function (file) {
            var stat;

            try {
                stat = fs.statSync(path.join(config.dataRoot, file));
            } catch (e) {
                debug('Unable to stat "' + file + '".');
                return;
            }

            // ignore everythin else than directories
            if (!stat.isDirectory()) {
                return;
            }

            var vol = getVolume(file, username, config);
            if (!vol) {
                return;
            }

            ret.push(vol);
            debug('Detected volume with repo: "' + file + '".');
        });

        callback(null, ret);
    });
}

function createVolume(name, user, config, callback) {
    assert(typeof name === 'string');
    assert(typeof callback === 'function');

    // TODO check if the sequence of creating things is fine - Johannes
    var vol = new Volume(name, config);
    var volPassword = generateNewVolumePassword();

    vol._initMetaDatabase();

    encfs.create(vol.dataPath, vol.mountPoint, volPassword, function (error, result) {
        if (error) {
            debug('Unable to create encfs container for volume "' + name + '". ' + JSON.stringify(error));
            return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
        }

        vol.addUser(user, volPassword, function (error, result) {
            if (error) {
                return callback(error);
            }

            var tmpDir = path.join(vol.mountPoint, 'tmp');
            fs.mkdirSync(tmpDir);

            vol.repo = new Repo(path.join(vol.mountPoint, REPO_SUBFOLDER), tmpDir);
            vol.repo.create(user.username, user.email, function (error) {
                if (error) {
                    return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
                }

                vol.repo.addFileWithData('README.md', 'README', function (error, commit) {
                    if (error) {
                        return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
                    }

                    callback(null, vol);
                });
            });
        });
    });
}

function destroyVolume(name, username, config, callback) {
    assert(typeof name === 'string');
    assert(name.length !== 0);
    assert(typeof username === 'string');
    assert(username.length !== 0);
    assert(typeof callback === 'function');

    var vol = getVolume(name, username, config);
    if (!vol) {
        return callback(new VolumeError(null, VolumeError.NO_SUCH_VOLUME));
    }

    vol.destroy(callback);
}

function getVolume(name, username, config) {
    assert(typeof name === 'string');
    assert(name.length !== 0);
    assert(typeof username === 'string');
    assert(username.length !== 0);
    assert(typeof config === 'object');

    // TODO check if username has access and if it exists
    var vol = new Volume(name, config);
    try {
        if (!fs.existsSync(vol.dataPath)) {
            debug('No volume "' + name + '" for user "' + username + '".');
            return null;
        }
    } catch (e) {
        debug('No volume "' + name + '" for user "' + username + '". ' + JSON.stringify(e));
        return null;
    }

    vol.repo = new Repo(path.join(vol.mountPoint, REPO_SUBFOLDER), vol.tmpPath);

    return vol;
}
