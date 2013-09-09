'use strict';

var fs = require('fs'),
    db = require('./database.js'),
    debug = require('debug')('volume.js'),
    encfs = require('encfs'),
    rimraf = require('rimraf'),
    path = require('path'),
    assert = require('assert'),
    crypto = require('crypto'),
    HttpError = require('./httperror.js'),
    Repo = require('./repo.js');

exports = module.exports = {
    Volume: Volume,
    list: listVolumes,
    create: createVolume,
    destroy: destroyVolume,
    get: getVolume
};

function generateNewVolumePassword() {
    return crypto.randomBytes(32).readUInt32LE(0);
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
        password: { type: 'String', priv: true },
        salt: { type: 'String', priv: true },
    });
};

Volume.prototype.open = function(password, callback) {
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

        that.encfs.mount(password, function (error, result) {
            if (error) {
                return callback(error);
            }

            callback();
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
    var folder = path.join(this.mountPoint, directory);

    fs.readdir(folder, function (error, files) {
        if (error) {
            return callback(error);
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
                console.log('Error getting file information', e);
            }

            ret.push(tmp);
        });

        callback(null, ret);
    });
};

Volume.prototype.addUser = function (user, password, callback) {
    if (!this.meta) {
        return callback(new Error('Volume not valid'));
    }

    // TODO encrypt password with user's password
    var record = {
        username: user.username,
        password: password
    };

    // pretend to encrypt the password with the users password
    this.meta.put(record, function (error) {
        if (error) {
            return callback(error);
        }

        return callback(null, record);
    });
};

Volume.prototype.removeUser = function (user, callback) {
    if (!this.meta) {
        return callback(new Error('Volume not valid'));
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
            return callback(new Error('Unable to read root folder'));
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

            var vol = new Volume(file, config);
            vol.repo = new Repo({ rootDir: vol.mountPoint, tmpDir: vol.tmpPath });

            ret.push(vol);

            debug('Detected repo : ' + file);
        });

        callback(null, ret);
    });
}

function createVolume(name, user, config, callback) {
    assert(typeof name === 'string');
    assert(typeof callback === 'function');

    // TODO check if the sequence of creating things is fine - Johannes
    var vol = new Volume(name, config);
    vol._initMetaDatabase();
    // TODO use strong password instead of users - Johannes
    // var volPassword = generateNewVolumePassword();
    var volPassword = user.password;

    encfs.create(vol.dataPath, vol.mountPoint, volPassword, function (error, result) {
        if (error) {
            return callback(new Error('Volume creation failed: ' + JSON.stringify(error)));
        }

        var tmpDir = path.join(vol.mountPoint, 'tmp');
        fs.mkdirSync(tmpDir);

        vol.addUser(user, volPassword, function (error, result) {
            if (error) {
                return callback(new Error('Adding user to volume failed.'));
            }

            // ## move this to repo
            vol.repo = new Repo({ rootDir: vol.mountPoint, tmpDir: tmpDir });
            vol.repo.create(user, function (error) {
                if (error) {
                    return callback(new Error('Error creating repo in volume'));
                }

                vol.repo.addFile('README.md', { contents: 'README' }, function (error, commit) {
                    if (error) {
                        return callback(new Error('Error adding README: ' + error));
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
        return callback(new Error('No such volume for this user.'));
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
            return null;
        }
    } catch (e) {
        debug('No such volume');
        return null;
    }

    vol.repo = new Repo({ rootDir: vol.mountPoint, tmpDir: vol.tmpPath });

    return vol;
}
