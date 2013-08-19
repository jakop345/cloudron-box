'use strict';

var exec = require('child_process').exec,
    debug = require('debug')('repo.js'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    fs = require('fs'),
    assert = require('assert');

exports = module.exports = Repo;

// creates a repo. before you do anything, call initialize()
function Repo(config) {
    this.gitDir = config.root + '/.git';
    this.checkoutDir = config.root;
    this.head = '';
}

// run arbitrary git command on this repo
Repo.prototype.git = function (command, callback) {
    var options = {
        env: { GIT_DIR: this.gitDir },
        cwd: this.checkoutDir
    };
    debug('GIT_DIR=' + this.gitDir + ' git ' + command);
    exec('git ' + command, options, function (error, stdout, stderr) {
        if (error) return callback(error);
        return callback(null, stdout);
    });
};

// FIXME: make head a commit
Repo.prototype._updateHead = function (callback) {
    var that = this;
    this.git('rev-parse HEAD', function (err, sha1) {
        if (err) return callback(err);
        that.head = sha1.trimRight();
        callback();
    });
};

Repo.prototype.initialize = function (callback) {
    if (!fs.existsSync(this.gitDir)) return callback();
    this._updateHead(callback);
};

Repo.prototype.create = function (options, callback) {
    assert(options.name && options.email);
    var that = this;
    mkdirp(this.checkoutDir, function (err) {
        if (err) return callback(err);
        that.git('init', function (err) {
            if (err) return callback(err);
            that.git('config user.name ' + options.name + ' && git config user.email ' + options.email, callback);
        });
    });
};

Repo.prototype._getCommit = function (commitish, callback) {
    this.git('show -s --pretty=%T,%ci,%P,%s ' + commitish, function (err, out) {
        if (err) return callback(err);
        var parts = out.trimRight().split(',');
        callback(null, {
            treeSha1: parts[0],
            commitDate: new Date(parts[1]),
            parentSha1: parts[2],
            subject: parts[3]
        });
    });
}

Repo.prototype.getTree = function (treeish, callback) {
    var tree = { entries: [ ] };

    if (treeish == '') return callback(null, tree);

    this.git('ls-tree -r ' + treeish, function (err, out) {
        var lines = out.trimRight().split('\n');
        lines.forEach(function (line) {
            var id, mode, name, type, _ref;
            // sample line : 100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 README
            var parts = line.split(/[\t ]+/, 4);
            var mode = parts[0];
            tree.entries.push({
                stat: { mode: parseInt(parts[0], 8) }, // match fs.Stat object
                sha1: parts[2],
                path: parts[3]
            });
        });
        callback(null, tree);
    });
};

Repo.prototype.isTracked = function (file, callback) {
    this.git('ls-files --error-unmatch ' + file, function (err, out) {
        return callback(null, !err);
    });
};

Repo.prototype.mtime = function (file, callback) {
    this.git('log --pretty=%ci -- ' + file, function (err, out) {
        if (err) return callback(null, 0);
        callback(null, new Date(out));
    });
}

Repo.prototype.fileChangeTime = function (file, fromRev, toRev, callback) {
    if (typeof callback === 'undefined') {
        callback = toRev;
        toRev = fromRev;
        fromRev = '';
    }

    var cmd = fromRev == ''
        ? 'log ' + fromRev + ' --pretty=%ci -- '+ file
        : 'log ' + fromRev + '..' + toRev + ' --pretty=%ci -- ' + file;
    this.git(cmd, function (err, out) {
        if (err) return callback(err);
        if (out.length == 0) return callback(null);
        callback(null, new Date(out));
    });
};

Repo.prototype._createCommit = function (message, callback) {
    var that = this;
    this.git('commit -a -m \'' + message + '\'', function (err, out) {
        if (err) return callback(err);
        that._updateHead(function (err) {
            if (err) return callback(err);
            that._getCommit(that.head, callback);
        });
    });
};

// FIXME: make stream API
// FIXME: needs checkout lock
Repo.prototype.addFile = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);
    if (fs.existsSync(absoluteFilePath)) {
        return callback(new Error('File already exists'));
    }

    if (!options.message) options.message = 'Add ' + file;

    mkdirp(path.dirname(absoluteFilePath), function (ignoredErr) {
        fs.rename(options.file, absoluteFilePath, function (err) {
            if (err) return callback(err);
            that.git('add ' + file, function (err) {
                if (err) return callback(err);
                that._createCommit(options.message, callback);
            });
        });
    });
};

Repo.prototype.updateFile = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);
    if (!fs.existsSync(absoluteFilePath)) {
        return callback(new Error('File does not exist'));
    }

    if (!options.message) options.message = 'Update ' + file;

    fs.rename(options.file, absoluteFilePath, function (err) {
        if (err) return callback(err);
        that.git('add ' + file, function (err) {
            if (err) return callback(err);
            that._createCommit(options.message, callback);
        });
    });
}

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

