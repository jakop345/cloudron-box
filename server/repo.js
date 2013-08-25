'use strict';

var exec = require('child_process').exec,
    debug = require('debug')('repo.js'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    fs = require('fs'),
    assert = require('assert'),
    crypto = require('crypto'),
    debug = require('debug')('repo.js'),
    util = require('util');

exports = module.exports = Repo;

// creates a repo. before you do anything
function Repo(config) {
    this.gitDir = config.rootDir + '/.git';
    this.checkoutDir = config.rootDir;
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
        if (error) return callback(error);
        return callback(null, stdout);
    });
};

Repo.prototype.getCommit = function (commitish, callback) {
    this.git('show -s --pretty=%T,%ci,%P,%s,%H ' + commitish, function (err, out) {
        if (err) return callback(err);
        var parts = out.trimRight().split(',');
        callback(null, {
            treeSha1: parts[0],
            commitDate: new Date(parts[1]),
            parentSha1: parts[2],
            subject: parts[3],
            sha1: parts[4]
        });
    });
}

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
        stat: { mode: parseInt(parts[0], 8), size: parseInt(parts[3]) }, // match fs.Stat object
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
        that.git('log -1 --pretty=%ci ' + commitish + ' -- ' + file, function (err, out) {
            if (err) return callback(null, 0);
            entry.stat.mtime = new Date(out);
            callback(null, entry);
        });
    });
};

Repo.prototype._createCommit = function (message, callback) {
    var that = this;
    this.git('commit -a -m \'' + message + '\'', function (err, out) {
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

// FIXME: make stream API
Repo.prototype._writeFileAndCommit = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);

    if (options.contents) {
        options.file = createTempFileSync(this.checkoutDir, options.contents);
    }

    fs.rename(options.file, absoluteFilePath, function (err) {
        if (err) return callback(err);
        that.git('add ' + file, function (err) {
            if (err) return callback(err);
            that._createCommit(options.message, callback);
        });
    });
};

// FIXME: needs checkout lock
Repo.prototype.addFile = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);
    if (fs.existsSync(absoluteFilePath)) {
        return callback(new Error('File already exists'));
    }

    if (!options.message) options.message = 'Add ' + file;

    mkdirp(path.dirname(absoluteFilePath), function (ignoredErr) {
        that._writeFileAndCommit(file, options, callback);
    });
};

Repo.prototype.updateFile = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);
    if (!fs.existsSync(absoluteFilePath)) {
        return callback(new Error('File does not exist'));
    }

    if (!options.message) options.message = 'Update ' + file;

    this._writeFileAndCommit(file, options, callback);
};

Repo.prototype.removeFile = function (file, callback) {
    var absoluteFilePath = path.join(this.checkoutDir, file);
    if (!fs.existsSync(absoluteFilePath)) {
        return callback(new Error('File does not exist'));
    }

    var message = 'Remove ' + file;
    var that = this;
    fs.unlink(path.join(this.checkoutDir, file), function (err) {
        if (err) return callback(err);
        that._createCommit(message, callback);
    });
};

Repo.prototype.createReadStream = function (file, options) {
    return fs.createReadStream(path.join(this.checkoutDir, file), options);
};

