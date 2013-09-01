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
    EventEmitter = require('events').EventEmitter,
    spawn = require('child_process').spawn;

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
        commands[i] = 'git --no-pager ' + commands[i];
    }
    var command = commands.join(' && ');

    debug('GIT_DIR=' + this.gitDir + ' ' + command);
    exec(command, options, function (error, stdout, stderr) {
        if (error) debug('Git error ' + error);
        if (error) return callback(error);
        return callback(null, stdout);
    });
};

Repo.prototype.spawn = function (args) {
    var args = [ '--no-pager' ].concat(args);
    var options = {
        env: { GIT_DIR: this.gitDir },
        cwd: this.checkoutDir
    };

    debug('GIT_DIR=' + this.gitDir + 'git ' + args.join(' '));
    var proc = spawn('git', args, options);
    proc.on('error', function (code, signal) {
        proc.stdout.emit('error', new RepoError(code, 'Error code:' + code + ' Signal:' + signal));
    });

    proc.on('exit', function (code, signal) {
        if (code !== 0) {
            return proc.stdout.emit('error', new RepoError(code, 'Error code:' + code + ' Signal:' + signal));
        }

        proc.stdout.emit('exit');
    });

    proc.stderr.on('data', function (data) { debug(data); });
    return proc;
}

var LOG_LINE_FORMAT = '%T,%ct,%P,%s,%H,%an,%ae';

function parseLogLine(line) {
    var parts = line.split(',');
    return {
        treeSha1: parts[0],
        commitDate: parseInt(parts[1], 10),
        parentSha1: parts[2],
        subject: parts[3],
        sha1: parts[4],
        author: {
            name: parts[5],
            email: parts[6]
        }
    };
}
 
Repo.prototype.getCommit = function (commitish, callback) {
    this.git('show -s --pretty=' + LOG_LINE_FORMAT + ' ' + commitish, function (err, out) {
        if (err) return callback(err);
        callback(null, parseLogLine(out.trimRight()));
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

Repo.prototype.getTree = function (treeish, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var tree = { entries: [ ] };

    if (treeish == '') return callback(null, tree);

    var path = options.path || '';
    this.git('ls-tree -r -l ' + treeish + ' -- ' + path, function (err, out) {
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

Repo.prototype.indexEntries = function (options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var path = options.path || '';
    this.git('ls-files -s --debug -- ' + path, function (err, out) {
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
    var ee = new EventEmitter();
    if (absoluteFilePath.length == 0) {
        process.nextTick(function () { ee.emit('error', new RepoError('ENOENT', 'Invalid file path')); });
        return ee;
    }

    if (options && options.rev) {
        return this.spawn(['cat-file', '-p', options.rev]).stdout;
    } else {
        return this.spawn(['show', 'HEAD:' + file]).stdout;
    }
};

function parseRawDiffLine(line) {
    // :100644 100644 78681069871a08110373201344e5016e218604ea 8b58e26f01a1af730e727b0eb0f1ff3b33a79de2 M      package.json
    var parts = line.split(/[ \t]+/);

    var result = {
        oldRev: parts[2],
        rev: parts[3],
        oldMode: parseInt(parts[0].substr(1), 8),
        mode: parseInt(parts[1], 8),
        status: '', // filled below
        oldPath: '', // filled below
        path: '' // filled below
    };

    switch (parts[4].charAt(0)) {
    case 'A': result.status = 'ADDED'; break;
    case 'C': result.status = 'COPIED'; break;
    case 'D': result.status = 'DELETED'; break;
    case 'M': result.status = 'MODIFIED'; break;
    case 'R': result.status = 'RENAMED'; break;
    case 'T': result.status = 'MODECHANGED'; break;
    case 'U': case 'X': // internal error
        return null;
    }

    if (result.status === 'Renamed' || result.status === 'Copied') {
        result.oldPath = parts[5];
        result.path = parts[6];
    } else {
        delete result.oldPath;
        result.path = parts[5];
    }

    return result;
}

Repo.prototype._getFileSizes = function (sha1s, callback) {
    var proc = this.spawn(['cat-file', '--batch-check']), data = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', function (d) { data += d });
    proc.stdout.on('end', function () {
        var sizes = [ ];
        data.trimRight().split('\n').forEach(function (line) {
            var parts = line.split(' ');
            var sha1 = parts[0], size = parseInt(parts[2]);
            sizes.push(size);
        });
        callback(null, sizes);
    });
    proc.stdout.on('error', callback);

    proc.stdin.write(sha1s.join('\n'));
    proc.stdin.end('\n');
};

Repo.prototype.getRevisions = function (file, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var limit = options.limit || 10;
    var revisions = [ ], that = this;

    this.git('log --no-abbrev --pretty=' + LOG_LINE_FORMAT + ' --raw -n ' + limit + ' -- ' + file, function (err, out) {
        if (err) return callback(err);
        var revisionBySha1 = { }, sha1s = [ ];
        var lines = out.trimRight().split('\n');
        for (var i = 0; i < lines.length; i += 3) {
            var commit = parseLogLine(lines[i].trimRight());
            var diff = parseRawDiffLine(lines[i+2].trimRight());
            var revision = {
                sha1: diff.rev,
                mode: diff.mode,
                path: diff.path,
                date: commit.commitDate,
                author: commit.author,
                subject: commit.subject,
                size: 0 // this will be filled up below
            };

            revisionBySha1[diff.rev] = revision;
            sha1s.push(diff.rev);
            revisions.push(revision);
        }

        that._getFileSizes(sha1s, function (err, sizes) {
            if (err) return callback(err);
            sizes.forEach(function (size, idx) { revisionBySha1[sha1s[idx]].size = sizes[idx]; });
            return callback(null, revisions);
        });
    });
};

Repo.prototype.diffTree = function (treeish1 /* from */, treeish2 /* to */, callback) {
    if (treeish1 === '') {
        // this is an empty tree to diff against. git mktree < /dev/null
        // for some reason --root doesn't work as expected
        treeish1 = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    }

    this.git('diff-tree -r ' + treeish1 + ' ' + treeish2, function (err, out) {
        if (err) return callback(err);
        var changes = [ ];
        out = out.trimRight();
        if (out === '') return callback(null, changes); // nothing changed

        out.split('\n').forEach(function (line) {
            changes.push(parseRawDiffLine(line));
        });
        callback(null, changes);
    });
};

