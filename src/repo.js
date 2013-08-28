'use strict';

var exec = require('child_process').exec,
    debug = require('debug')('repo.js'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    fs = require('fs'),
    assert = require('assert'),
    crypto = require('crypto'),
    debug = require('debug')('repo.js'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter;

exports = module.exports = Repo;

function RepoError(code, msg) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.code = code;
    this.message = msg;
}
util.inherits(RepoError, Error);

// creates a repo. before you do anything
function Repo(config) {
    this.gitDir = config.rootDir + '/.git';
    this.checkoutDir = config.rootDir;
    this.tmpDir = config.tmpDir;
}

// run arbitrary git command on this repo
Repo.prototype.git = function (commands, callback) {
    var options = {
        env: { GIT_DIR: this.gitDir },
        cwd: this.checkoutDir
    };
    if (!util.isArray(commands)) commands = [ commands ];

    for (var i = 0; i < commands.length; i++) {
        commands[i] = 'git ' + commands[i];
    }
    var command = commands.join(' && ');

    debug('GIT_DIR=' + this.gitDir + command);
    exec(command, options, function (error, stdout, stderr) {
        if (error) debug('Git error ' + error);
        if (error) return callback(error);
        return callback(null, stdout);
    });
};

Repo.prototype.getCommit = function (commitish, callback) {
    this.git('show -s --pretty=%T,%ct,%P,%s,%H,%an,%ae ' + commitish, function (err, out) {
        if (err) return callback(err);
        var parts = out.trimRight().split(',');
        callback(null, {
            treeSha1: parts[0],
            commitDate: parseInt(parts[1], 10),
            parentSha1: parts[2],
            subject: parts[3],
            sha1: parts[4],
            author: {
                name: parts[5],
                email: parts[6]
            }
        });
    });
};

Repo.prototype.create = function (options, callback) {
    assert(options.name && options.email);
    var that = this;
    mkdirp(this.checkoutDir, function (err) {
        if (err) return callback(err);
        that.git('init', function (err) {
            if (err) return callback(err);
            that.git(['config user.name ' + options.name, 'config user.email ' + options.email], callback);
        });
    });
};

function parseTreeLine(line) {
    var id, mode, name, type, _ref;
    // sample line : 100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 43 README
    var parts = line.split(/[\t ]+/, 5);
    var mode = parts[0];
    return {
        mode: parseInt(parts[0], 8),
        size: parseInt(parts[3]),
        sha1: parts[2],
        path: parts[4]
    };
}

Repo.prototype.getTree = function (treeish, callback) {
    var tree = { entries: [ ] };

    if (treeish == '') return callback(null, tree);

    this.git('ls-tree -r -l ' + treeish, function (err, out) {
        var lines = out.trimRight().split('\n');
        lines.forEach(function (line) { tree.entries.push(parseTreeLine(line)); });
        callback(null, tree);
    });
};

Repo.prototype.isTracked = function (file, callback) {
    this.git('ls-files --error-unmatch ' + file, function (err, out) {
        return callback(null, !err);
    });
};

Repo.prototype.fileEntry = function (file, commitish, callback) {
    var that = this;

    this.git('ls-tree -l ' + commitish + ' -- ' + file, function (err, out) {
        out = out ? out.trimRight() : '';
        if (out.length == 0) return callback(null, null); // file was removed

        var entry = parseTreeLine(out);

        // TODO: This is expensive potentially. One option for HEAD is to stat the checkout
        // dir (would that work after we recreated the repo from recovery?)
        that.git('log -1 --pretty=%ct ' + commitish + ' -- ' + file, function (err, out) {
            if (err) return callback(null, 0);
            entry.mtime = parseInt(out.trimRight());
            callback(null, entry);
        });
    });
};

Repo.prototype._createCommit = function (message, callback) {
    var that = this;
    // --allow-empty allows us to create a new revision even if file didn't change
    // this could happen if the same file is uploaded from another client
    this.git('commit --allow-empty -a -m \'' + message + '\'', function (err, out) {
        if (err) return callback(err);
        that.getCommit('HEAD', callback);
    });
};

function createTempFileSync(dir, contents) {
    // dir is required because renames won't work across file systems
    var filename = path.join(dir, '___addFile___' + crypto.randomBytes(4).readUInt32LE(0));
    fs.writeFileSync(filename, contents);
    return filename;
}

function parseIndexLine(line) {
    var mode, sha1, stage, name;
    // sample line : 100644 294c76dd833e77480ba85bdff83b4ef44fa4c08f 0  repo-test.js
    var parts = line.split(/[\t ]+/, 4);
    var mode = parts[0];
    return {
        mode: parseInt(parts[0], 8),
        sha1: parts[1],
        path: parts[3]
    };
}

// FIXME: make stream API
Repo.prototype._writeFileAndCommit = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);

    if (options.contents) {
        options.file = createTempFileSync(this.tmpDir, options.contents);
    }

    fs.rename(options.file, absoluteFilePath, function (err) {
        if (err) return callback(err);
        that.git(['add ' + file, 'ls-files -s -- ' + file], function (err, out) {
            if (err) return callback(err);
            var fileInfo = parseIndexLine(out.trimRight());
            that._createCommit(options.message, function (err, commit) {
                if (err) return callback(err);
                callback(null, fileInfo, commit);
            });
        });
    });
};

function parseIndexLines(lines, i) {
    /*
        100644 81cc9ef1205995550f8faea11180a1ff7806ed81 0   webadmin/volume-client.js
          ctime: 1376890412:218737065
          mtime: 1376890412:218737065
          dev: 2049 ino: 3391167
          uid: 1000 gid: 1000
          size: 3994    flags: 0
     */
    var entry = parseIndexLine(lines[i]);
    entry.mtime = parseInt(lines[i+1].split(/:/)[1]);
    entry.size = parseInt(lines[i+5].split(/:/)[1]);
    return entry;
}

Repo.prototype.indexEntries = function (callback) {
    this.git('ls-files -s --debug', function (err, out) {
        if (err) return callback(err);
        out = out.trimRight();
        var lines = out.split('\n');
        var entries = [ ];
        for (var i = 0; i < lines.length; i += 6) {
            entries.push(parseIndexLines(lines, i));
        }
        callback(null, entries);
    });
};

Repo.prototype._absoluteFilePath = function (filePath) {
    var absoluteFilePath = path.resolve(path.join(this.checkoutDir, filePath));
    return absoluteFilePath.slice(0, this.checkoutDir.length) == this.checkoutDir
            ? absoluteFilePath
            : ''; // the path is outside the repo
}

// FIXME: needs checkout lock
Repo.prototype.addFile = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath.length == 0) {
        return callback(new RepoError('ENOENT', 'Invalid file path'));
    }

    if (fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File already exists'));
    }

    if (!options.message) options.message = 'Add ' + file;

    mkdirp(path.dirname(absoluteFilePath), function (ignoredErr) {
        that._writeFileAndCommit(file, options, callback);
    });
};

Repo.prototype.updateFile = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath.length == 0) {
        return callback(new RepoError('ENOENT', 'Invalid file path'));
    }

    if (!fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File does not exist'));
    }

    if (!options.message) options.message = 'Update ' + file;

    this._writeFileAndCommit(file, options, callback);
};

Repo.prototype.removeFile = function (file, callback) {
    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath.length == 0) {
        return callback(new RepoError('ENOENT', 'Invalid file path'));
    }

    if (!fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File does not exist'));
    }

    var message = 'Remove ' + file;
    var that = this;
    fs.unlink(path.join(this.checkoutDir, file), function (err) {
        if (err) return callback(err);
        that._createCommit(message, callback);
    });
};

Repo.prototype.createReadStream = function (file, options) {
    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath.length == 0) {
        var ee = new EventEmitter();
        process.nextTick(function () { ee.emit('error', new RepoError('ENOENT', 'Invalid file path')); });
        return ee;
    }

    return fs.createReadStream(absoluteFilePath, options);
};

