'use strict';

var fs = require('fs'),
    db = require('./database'),
    User = require('./user'),
    debug = require('debug')('server:volume'),
    encfs = require('encfs'),
    rimraf = require('rimraf'),
    path = require('path'),
    assert = require('assert'),
    crypto = require('crypto'),
    aes = require('./aes-helper'),
    ursa = require('ursa'),
    async = require('async'),
    util = require('util'),
    Repo = require('./repo'),
    safe = require('safetydance');

exports = module.exports = {
    Volume: Volume,
    VolumeError: VolumeError,
    list: listVolumes,
    create: createVolume,
    get: getVolume
};

var REPO_SUBFOLDER = 'repo';
var VOLUME_META_FILENAME = '.meta';
var CRYPTO_SALT_SIZE = 64; // 512-bit salt

function ensureArgs(args, expected) {
    assert(args.length === expected.length);

    for (var i = 0; i < args.length; ++i) {
        if (expected[i]) {
            assert(typeof args[i] === expected[i]);
        }
    }
}

// http://dustinsenos.com/articles/customErrorsInNode
// http://code.google.com/p/v8/wiki/JavaScriptStackTraceApi
function VolumeError(err, reason) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.message = safe.JSON.stringify(err);
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
VolumeError.NO_SUCH_USER = 6;
VolumeError.WRONG_USER_PASSWORD = 7;
VolumeError.EMPTY_PASSWORD = 8;
VolumeError.MOUNTED = 9;

// TODO is this even a good password generator? - Johannes
function generateNewVolumePassword() {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()_+?{}[]|:;"~`<>,.-=';
    var charsLength = chars.length;
    var password = '';

    for (var i = 0; i < 64; ++i) {
        password += chars.charAt(Math.floor(Math.random() * charsLength));
    }

    return password;
}

function Volume(name, config) {
    ensureArgs(arguments, ['string', 'object']);

    this.name = name;
    this.config = config;
    this.dataPath = this._resolveVolumeRootPath();
    this.mountPoint = this._resolveVolumeMountPoint();
    this.tmpPath = path.join(this.mountPoint, 'tmp');
    this.encfs = new encfs.Root(this.dataPath, this.mountPoint);
    this.repo = null;
    this.meta = null;

    this._initMetaDatabase();
}

Volume.prototype._resolveVolumeRootPath = function() {
    return path.join(this.config.dataRoot, this.name);
};

Volume.prototype._resolveVolumeMountPoint = function() {
    return path.join(this.config.mountRoot, this.name);
};

Volume.prototype._initMetaDatabase = function () {
    this.meta = new db.Table(path.join(this.dataPath, VOLUME_META_FILENAME), {
        username: { type: 'String', hashKey: true },
        passwordCypher: { type: 'String', priv: true }
    });
};

Volume.prototype.isMounted = function (callback) {
    ensureArgs(arguments, ['function']);

    this.encfs.isMounted(function (error, mounted) {
        if (error) {
            debug('Error checking if encfs volume is mounted', error);
            return callback(error);
        }

        return callback(null, mounted);
    });
};

Volume.prototype.open = function (username, password, callback) {
    ensureArgs(arguments, ['string', 'string', 'function']);

    var that = this;

    this.encfs.isMounted(function (error, mounted) {
        if (error) return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));

        if (mounted && that.repo) {
            return callback();
        }

        that.meta.get(username, function (error, record) {
            if (error) {
                debug('Unable to get user from meta db. ' + safe.JSON.stringify(error));
                return callback(new VolumeError(error, VolumeError.NO_SUCH_USER));
            }

            User.verify(username, password, function (error, user) {
                if (error) {
                    debug('Unable to get user from meta db. ' + safe.JSON.stringify(error));
                    return callback(new VolumeError(error, VolumeError.WRONG_USER_PASSWORD));
                }

                var saltBuffer = new Buffer(user.salt, 'hex');
                var privateKeyPem = aes.decrypt(user.privatePemCipher, password, saltBuffer);
                var keyPair = ursa.createPrivateKey(privateKeyPem, password, 'utf8');
                var volPassword = keyPair.decrypt(record.passwordCipher, 'hex', 'utf8');

                if (!volPassword) {
                    return callback(new VolumeError(error, VolumeError.WRONG_USER_PASSWORD));
                }

                that.encfs.mount(volPassword, function (error, result) {
                    if (error) return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
                    callback();
                });
            });
        });
    });
};

Volume.prototype.close = function (callback) {
    ensureArgs(arguments, ['function']);

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

Volume.prototype.destroy = function (user, password, callback) {
    ensureArgs(arguments, ['object', 'string', 'function']);

    var that = this;

    function cleanupFolders() {
        rimraf(that.dataPath, function (error) {
            if (error) {
                debug('Failed to delete volume root path.', error);
                return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
            }

            rimraf(that.mountPoint, function (error) {
                if (error) {
                    debug('Failed to delete volume mount point.', error);
                    return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
                }

                debug('Volume ' + that.name + ' successfully deleted.');
                callback();
            });
        });
    }

    this.verifyUser(user, password, function (error) {
        if (error) return callback(error);

        that.encfs.isMounted(function (error, mounted) {
            if (!mounted) {
                cleanupFolders();
                return;
            }

            that.encfs.unmount(function (error) {
                if (error) {
                    debug('Error unmounting the volume. Non fatal.', error);
                    return callback(new VolumeError(error, VolumeError.MOUNTED));
                }

                cleanupFolders();
            });
        });
    });
};

Volume.prototype.listFiles = function (directory, callback) {
    ensureArgs(arguments, ['string', 'function']);

    var that = this;

    this.encfs.isMounted(function (error, mounted) {
        if (error) {
            debug('Error checking if encfs for volume "' + that.name + '" is mounted.');
            return callback(error);
        }

        if (!mounted) {
            debug('Encfs for volume "' + that.name + '" is not mounted.');
            return callback(new VolumeError(null, VolumeError.NOT_MOUNTED));
        }

        that.repo.listFiles({ path: directory, listSubtrees: false }, function (error, tree) {
            if (error) {
                debug('Unable to read directory "' + directory + '" for volume "' + that.name + '".');
                return callback(new VolumeError(error, VolumeError.READ_ERROR));
            }

            callback(null, tree);
        });
    });
};

Volume.prototype.addUser = function (newUser, oldUser, password, callback) {
    ensureArgs(arguments, ['object', 'object', 'string', 'function']);

    var that = this;

    if (!this.meta) {
        debug('Invalid volume "' + this.name + '". Misses the meta database.');
        return callback(new VolumeError(null, VolumeError.META_MISSING));
    }

    this.meta.get(oldUser.username, function (error, userRecord) {
        if (error) {
            debug('Unable to get user from meta db. ' + safe.JSON.stringify(error));
            return callback(new VolumeError(error, VolumeError.NO_SUCH_USER));
        }

        // retrieve the keypair from the authorized user
        var saltBuffer = new Buffer(oldUser.salt, 'hex');
        var privateKeyPem = aes.decrypt(oldUser.privatePemCipher, password, saltBuffer);
        var keyPair = ursa.createPrivateKey(privateKeyPem, password, 'utf8');

        // retrieve the volume password from the authorized user
        var volumePassword = keyPair.decrypt(userRecord.passwordCipher, 'hex', 'utf8');

        if (!volumePassword) {
            debug('Unable to decrypt volume master password');
            return callback(new VolumeError(null, VolumeError.WRONG_USER_PASSWORD));
        }

        var publicKey = ursa.createPublicKey(newUser.publicPem);
        var record = {
            username: newUser.username,
            passwordCipher: publicKey.encrypt(volumePassword, 'utf8', 'hex')
        };

        that.meta.put(record, function (error) {
            if (error) {
                debug('Unable to add user to meta db. ' + safe.JSON.stringify(error));
                return callback(error);
            }

            return callback(null, record);
        });
    });
};

Volume.prototype.removeUser = function (user, callback) {
    ensureArgs(arguments, ['object', 'function']);

    if (!this.meta) {
        debug('Invalid volume "' + this.name + '". Misses the meta database.');
        return callback(new VolumeError(null, VolumeError.META_MISSING));
    }

    this.meta.remove(user.username, callback);
};

Volume.prototype.verifyUser = function (user, password, callback) {
    ensureArgs(arguments, ['object', 'string', 'function']);

    this.meta.get(user.username, function (error, volumeRecord) {
        if (error) {
            debug('Unable to get user from meta db. ' + safe.JSON.stringify(error));
            return callback(new VolumeError(null, VolumeError.NO_SUCH_USER));
        }

        User.verify(user.username, password, function (error, userRecord) {
            if (error) {
                debug('Unable to get user from meta db. ' + safe.JSON.stringify(error));
                return callback(new VolumeError(error, VolumeError.NO_SUCH_USER));
            }

            var saltBuffer = new Buffer(userRecord.salt, 'hex');
            var privateKeyPem = aes.decrypt(userRecord.privatePemCipher, password, saltBuffer);
            var keyPair = ursa.createPrivateKey(privateKeyPem, password, 'utf8');
            var volumePassword = keyPair.decrypt(volumeRecord.passwordCipher, 'hex', 'utf8');

            if (!volumePassword) {
                debug('Unable to decrypt volume master password');
                return callback(new VolumeError(null, VolumeError.WRONG_USER_PASSWORD));
            }

            callback(null);
        });
    });
};

Volume.prototype.hasUserByName = function (username, callback) {
    ensureArgs(arguments, ['string', 'function']);

    if (!this.meta) {
        debug('Invalid volume "' + this.name + '". Misses the meta database.');
        return callback(new VolumeError(null, VolumeError.META_MISSING));
    }

    this.meta.get(username, function (error, result) {
        // TODO maybe more error checking?
        callback(null, !!result);
    });
};

function listVolumes(username, config, callback) {
    ensureArgs(arguments, ['string', 'object', 'function']);
    assert(config.dataRoot);
    assert(config.mountRoot);

    fs.readdir(config.dataRoot, function (error, files) {
        if (error) {
            debug('Unable to list volumes.' + safe.JSON.stringify(error));
            return callback(new VolumeError(error, VolumeError.READ_ERROR));
        }

        var ret = [];

        async.each(files, function (file, callback) {
            fs.stat(path.join(config.dataRoot, file), function (error, stat) {
                if (error) {
                    debug('Unable to stat "' + file + '".', error);
                    return callback(null);
                }

                // ignore everythin else than directories
                if (!stat.isDirectory()) {
                    return callback(null);
                }

                getVolume(file, username, config, function (error, result) {
                    if (!error) {
                        debug('Detected volume with repo: "' + file + '".');
                        ret.push(result);
                    }

                    callback(null);
                });
            });
        }, function (error) {
            if (error) debug('This should never happen.');
            callback(null, ret);
        });
    });
}

function createVolume(name, user, password, config, callback) {
    ensureArgs(arguments, ['string', 'object', 'string', 'object', 'function']);

    // TODO check if the sequence of creating things is fine - Johannes
    var vol = new Volume(name, config);
    var volPassword = generateNewVolumePassword();

    vol._initMetaDatabase();

    encfs.create(vol.dataPath, vol.mountPoint, volPassword, function (error, result) {
        if (error) {
            debug('Unable to create encfs container for volume "' + name + '". ' + safe.JSON.stringify(error));
            return callback(new VolumeError(error, VolumeError.INTERNAL_ERROR));
        }

        var publicKey = ursa.createPublicKey(user.publicPem);
        var record = {
            username: user.username,
            passwordCipher: publicKey.encrypt(volPassword, 'utf8', 'hex')
        };

        vol.meta.put(record, function (error) {
            if (error) {
                debug('Unable to add user to meta db. ' + safe.JSON.stringify(error));
                return callback(error);
            }

            var tmpDir = path.join(vol.mountPoint, 'tmp');
            if (!safe.fs.mkdirSync(tmpDir)) {
                return callback(new VolumeError(safe.error, VolumeError.INTERNAL_ERROR));
            }

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

function getVolume(name, username, config, callback) {
    ensureArgs(arguments, ['string', 'string', 'object', 'function']);

    // TODO check if username has access and if it exists
    var vol = new Volume(name, config);
    if (!safe.fs.existsSync(vol.dataPath)) {
        debug('No volume "' + name + '" for user "' + username + '". ' + safe.JSON.stringify(safe.error));
        return callback(new VolumeError());
    }

    // Check if that volume has a meta information file, if not it is not created properly or broken
    if (!safe.fs.existsSync(path.join(vol.dataPath, VOLUME_META_FILENAME))) {
        debug('Volume "' + name + '" for user "' + username + '" does not have meta information, it is possibly broken.');
        return callback(new VolumeError());
    }

    vol.hasUserByName(username, function (error, result) {
        if (error || !result) {
            debug('User "' + username + '" has no access to volume "' + name + '".');
            return callback(new VolumeError());
        }

        vol.repo = new Repo(path.join(vol.mountPoint, REPO_SUBFOLDER), vol.tmpPath);

        callback(null, vol);
    });
}
