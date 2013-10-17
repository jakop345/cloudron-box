'use strict';

var exec = require('child_process').exec,
    path = require('path'),
    mkdirp = require('mkdirp'),
    fs = require('fs'),
    assert = require('assert'),
    crypto = require('crypto'),
    debug = require('debug')('server:repo'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    spawn = require('child_process').spawn,
    constants = require('constants'); // internal module? same as process.binding('constants')

exports = module.exports = Repo;

function RepoError(code, msg) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.code = code;
    this.message = msg;
}
util.inherits(RepoError, Error);

function isDir(mode) {
    return (mode & constants.S_IFMT) === constants.S_IFDIR;
}

function isFile(mode) {
    return (mode & constants.S_IFMT) === constants.S_IFREG;
}

// creates a repo. before you do anything
function Repo(rootDir, tmpDir) {
    this.gitDir = path.join(rootDir, '.git'); // must not contain trailing slash
    this.checkoutDir = rootDir;
    this.tmpDir = tmpDir;
}

// run arbitrary commands on this repo
Repo.prototype._exec = function (command, callback) {
    assert(typeof command === 'string');

    var options = {
        env: { GIT_DIR: this.gitDir },
        cwd: this.checkoutDir
    };

    exec(command, options, callback);
};

// run arbitrary git command on this repo
Repo.prototype.git = function (args, callback) {
    assert(util.isArray(args));

    var stdout = '', stderr = '';
    var proc = this.spawn(args);
    proc.stdout.on('data', function (data) { stdout += data; });
    proc.stderr.on('data', function (data) { stderr += data; });
    proc.on('close', function (code, signal) { // close guarantess stdio streams are closed unlike 'exit'
        var error = code !== 0 ? new RepoError(code, code) : null;
        callback(error, stdout, stderr);
    });
};

Repo.prototype.spawn = function (args) {
    assert(util.isArray(args));

    args = args.filter(function removeNullArgs(arg) { return arg !== ''; });
    args = [ '--no-pager' ].concat(args);

    var options = {
        env: { GIT_DIR: this.gitDir },
        cwd: this.checkoutDir
    };

    debug('GIT_DIR=' + this.gitDir + ' git ' + args.join(' '));
    var proc = spawn('git', args, options);
    proc.on('error', function (error) {
        debug('Error spawning git process:', error);
    });
    proc.stderr.on('data', function (data) { debug(data); });
    return proc;
};

var LOG_LINE_FORMAT = '%T%x00%ct%x00%P%x00%s%x00%H%x00%an%x00%ae%x00';
var LOG_LINE_FORMAT_FIELD_COUNT = LOG_LINE_FORMAT.split('%x00').length;

function parseLogLine(line, startPos) {
    assert(typeof line === 'string' && line.length !== 0);
    var pos = [ startPos ];
    for (var i = 1; i <= LOG_LINE_FORMAT_FIELD_COUNT; i++) {
        pos[i] = line.indexOf('\0', pos[i-1]) + 1;
    }

    var commit = {
        treeSha1: line.slice(pos[0], pos[1] - 1),
        commitDate: parseInt(line.slice(pos[1], pos[2] - 1), 10),
        parentSha1: line.slice(pos[2], pos[3] - 1),
        subject: line.slice(pos[3], pos[4] - 1),
        sha1: line.slice(pos[4], pos[5] - 1),
        author: {
            name: line.slice(pos[5], pos[6] - 1),
            email: line.slice(pos[6], pos[7] - 1)
        }
    };

    return { commit: commit, pos: pos[7] };
}

Repo.prototype.getCommit = function (commitish, callback) {
    assert(typeof commitish === 'string');
    assert(typeof callback === 'function');

    this.git(['show', '-z', '--raw', '-s', '--pretty=' + LOG_LINE_FORMAT, commitish], function (err, out) {
        if (err) return callback(err);
        callback(null, parseLogLine(out, 0).commit);
    });
};

Repo.prototype.create = function (username, email, callback) {
    assert(typeof username === 'string' && username.length !== 0);
    assert(typeof email === 'string' && email.length !== 0);

    var that = this;
    mkdirp(this.checkoutDir, function (err) {
        if (err) return callback(err);
        that.git(['init'], function (err) {
            if (err) return callback(err);
            that.git(['config', 'user.name', username], function (err) {
                if (err) return callback(err);
                that.git(['config', 'user.email', email], callback);
            });
        });
    });
};

function parseTreeLine(line) {
    assert(typeof line === 'string' && line.length !== 0);

    var id, mode, name, type, _ref;
    // long line format: <mode> SP <type> SP <object> SP+ <object size> TAB <file>
    // object size is right justified to a min of 7
    // sample line : 100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391     43\tREADME
    var parts = line.split(/[\t ]+/, 4);
    var endPos = parts[0].length + 1 + parts[1].length + 1 + parts[2].length + 1 + Math.max(7, parts[3].length) + 1;

    return {
        mode: parseInt(parts[0], 8),
        size: parseInt(parts[3], 10) || 0, // for dirs, size field is '-' and parseInt will return NaN
        sha1: parts[2],
        path: line.substr(endPos)
    };
}

Repo.prototype.getTree = function (treeish, options, callback) {
    assert(typeof treeish === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var tree = { entries: [ ] };

    if (treeish === '') return callback(null, tree);

    var path = options.path || '', listSubtrees = options.listSubtrees ? '-t' : '';
    this.git(['ls-tree', '-z', '-r', '-l', listSubtrees, treeish, '--', path], function (err, out) {
        if (err) return callback(err);
        var lines = out.split('\0');
        lines.forEach(function (line) { if (line.length !== 0) tree.entries.push(parseTreeLine(line)); });
        callback(null, tree);
    });
};

Repo.prototype.isTracked = function (file, callback) {
    assert(typeof file === 'string');
    assert(typeof callback === 'function');

    this.git(['ls-files', '--error-unmatch', file], function (err, out) {
        return callback(null, !err);
    });
};

Repo.prototype.fileEntry = function (file, commitish, callback) {
    assert(typeof file === 'string');
    assert(typeof commitish === 'string');
    assert(typeof callback === 'function');

    var that = this;

    if (file === '/') { // ls-tree won't give root info :(
        this.getCommit(commitish, function (err, commit) {
            if (err) return callback(err);
            callback(null, {
                mode: parseInt('040000', 8),
                size: 0,
                sha1: commit.treeSha1,
                path: '/'
            });
        });
        return;
    }

    // ls-tree shows dir contents if there is a trailing '/', so strip it
    if (file.charAt(file.length-1) === '/') file = file.substr(0, file.length - 1);

    this.git(['ls-tree', '-z', '-l', commitish, '--', file], function (err, out) {
        if (!out || out.length === 0) return callback(new RepoError('ENOENT', 'File removed'));

        var entry = parseTreeLine(out.slice(0, -1));

        // dirs don't have mtime information
        if (isDir(entry.mode)) return callback(null, entry);

        // TODO: This is expensive potentially. One option for HEAD is to stat the checkout
        // dir (would that work after we recreated the repo from recovery?)
        that.git(['log', '-z', '-1', '--pretty=%ct', commitish, '--', file], function (err, out) {
            entry.mtime = !err && out ? parseInt(out.slice(0, -1), 10) : 0;
            callback(null, entry);
        });
    });
};

Repo.prototype._createCommit = function (message, callback) {
    assert(typeof message === 'string');

    var that = this;
    // --allow-empty allows us to create a new revision even if file didn't change
    // this could happen if the same file is uploaded from another client
    // note that git commits have a 1 second precision, so --allow-empty may return
    // the reference to the previous commit if we are fast enough
    this.git(['commit', '--allow-empty', '-a', '-m', message], function (err, out) {
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
    assert(typeof line === 'string' && line.length !== 0);

    var mode, sha1, stage, name;
    // sample line : 100644 294c76dd833e77480ba85bdff83b4ef44fa4c08f 0\trepo-test.js
    var parts = line.split(/[\t ]+/, 3);
    var endPos = parts[0].length + 1 + parts[1].length + 1 + parts[2].length  + 1;

    return {
        mode: parseInt(parts[0], 8),
        sha1: parts[1],
        path: line.substr(endPos)
    };
}

Repo.prototype._addFileAndCommit = function (file, options, callback) {
    var that = this;
    this.git(['add', file], function (err) {
        if (err) return callback(err);
        that.git(['ls-files', '-z', '-s', '--', file], function (err, out) {
            if (err) return callback(err);
            var fileInfo = parseIndexLine(out.slice(0, -1));
            var message = options.message || (options._operation + ' ' + file);
            that._createCommit(message, function (err, commit) {
                if (err) return callback(err);
                callback(null, fileInfo, commit);
            });
        });
    });
};

// FIXME: make stream API
Repo.prototype._renameFileAndCommit = function (file, options, callback) {
    var that = this;
    var absoluteFilePath = path.join(this.checkoutDir, file);

    fs.rename(options.file, absoluteFilePath, function (err) {
        if (err) return callback(err);
        that._addFileAndCommit(file, options, callback);
    });
};

function parseIndexLines(out) {
    /*
        100644 81cc9ef1205995550f8faea11180a1ff7806ed81 0\twebadmin/volume-client.js\0ctime: 1376890412:218737065
          mtime: 1376890412:218737065
          dev: 2049 ino: 3391167
          uid: 1000 gid: 1000
          size: 3994    flags: 0
     */

    var lines = out.split('\n');
    var entries = [ ];
    for (var i = 0; i < lines.length; i += 5) {
        if (lines[i].length === 0) break;

        var entry = parseIndexLine(lines[i].substr(0, lines[i].lastIndexOf('\0')));
        entry.mtime = parseInt(lines[i+1].split(/:/)[1], 10);
        entry.size = parseInt(lines[i+4].split(/:/)[1], 10);

        entries.push(entry);
    }
    return entries;
}

Repo.prototype.indexEntries = function (options, callback) {
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var path = options.path || '';
    this.git(['ls-files', '-z', '-s', '--debug', '--', path], function (err, out) {
        if (err) return callback(err);
        callback(null, parseIndexLines(out));
    });
};

Repo.prototype._absoluteFilePath = function (filePath) {
    var relativeFilePath = path.relative(this.gitDir, filePath);
    if (relativeFilePath.slice(0, 3) !== '../') return null; // inside .git

    var absoluteFilePath = path.resolve(this.checkoutDir, filePath);
    return absoluteFilePath.slice(0, this.checkoutDir.length) == this.checkoutDir
            ? absoluteFilePath
            : null; // the path is outside the repo
};

// FIXME: needs checkout lock
Repo.prototype.addFileWithData = function (file, data, options, callback) {
    assert(typeof file === 'string');
    assert(typeof data === 'string' || Buffer.isBuffer(data));
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    options.file = createTempFileSync(this.tmpDir, data);
    this.addFile(file, options, callback);
};

Repo.prototype.addFile = function (file, options, callback) {
    assert(typeof file === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var that = this;
    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath === null) {
        return callback(new RepoError('ENOENT', 'Invalid file path'));
    }

    if (fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File already exists'));
    }

    options._operation = 'Add';

    mkdirp(path.dirname(absoluteFilePath), function (ignoredErr) {
        that._renameFileAndCommit(file, options, callback);
    });
};

Repo.prototype.updateFile = function (file, options, callback) {
    assert(typeof file === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var that = this;
    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath === null) {
        return callback(new RepoError('ENOENT', 'Invalid file path'));
    }

    if (!fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File does not exist'));
    }

    options._operation = 'Update';

    this._renameFileAndCommit(file, options, callback);
};

Repo.prototype.removeFile = function (file, options, callback) {
    assert(typeof file === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath === null) {
        return callback(new RepoError('ENOENT', 'Invalid file path'));
    }

    var that = this;
    this.fileEntry(file, 'HEAD', function (err, entry) {
        if (err) return callback(err);
        var rev = options.rev || '*';
        if (entry.sha1 !== rev && rev !== '*') return callback(new RepoError('EOUTOFDATE', 'Out of date'));

        var recursive = options.recursive ? '-r' : '';
        that.git(['rm', recursive, file], function (err, out) {
            if (err) return callback(new RepoError('ENOENT', 'File does not exist'));

            var message = 'Remove ' + file;
            that._createCommit(message, function (err, commit) { return callback(err, entry, commit); });
        });
    });
};

Repo.prototype.moveFile = function (from, to, options, callback) {
    assert(typeof from === 'string');
    assert(typeof to === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var that = this;
    this.fileEntry(from, 'HEAD', function (err, entry) {
        if (err) return callback(err);
        var rev = options.rev || '*';

        if (entry.sha1 !== rev && rev !== '*') return callback(new RepoError('EOUTOFDATE', 'Out of date'));

        that.git(['mv', from, to], function (err, out) {
            if (err) return callback(new RepoError('ENOENT', 'File does not exist'));

            var message = 'Move from ' + from + ' to ' + to;
            that._addFileAndCommit(to, { message: message }, callback);
        });
    });
};

Repo.prototype.copyFile = function (from, to, options, callback) {
    assert(typeof from === 'string');
    assert(typeof to === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var fromAbsoluteFilePath = this._absoluteFilePath(from);
    if (fromAbsoluteFilePath === null) {
        return callback(new RepoError('ENOENT', 'Invalid from path'));
    }
    var toAbsoluteFilePath = this._absoluteFilePath(to);
    if (toAbsoluteFilePath === null) {
        return callback(new RepoError('ENOENT', 'Invalid to path'));
    }

    var that = this;
    this.fileEntry(from, 'HEAD', function (err, entry) {
        if (err) return callback(err);
        var rev = options.rev || '*';

        if (entry.sha1 !== rev && rev !== '*') return callback(new RepoError('EOUTOFDATE', 'Out of date'));

        that._exec('cp -r ' + fromAbsoluteFilePath + ' ' + toAbsoluteFilePath, function (err, out) {
            if (err) return callback(new RepoError('ENOENT', 'File does not exist'));

            var message = 'Copy from ' + from + ' to ' + to;
            that._addFileAndCommit(to, { message: message }, callback);
        });
    });
};

Repo.prototype.createReadStream = function (file, options) {
    assert(typeof file === 'string');
    options = options || { };

    var absoluteFilePath = this._absoluteFilePath(file);
    var ee = new EventEmitter();
    if (absoluteFilePath === null) {
        process.nextTick(function () { ee.emit('error', new RepoError('ENOENT', 'Invalid file path')); });
        return ee;
    }

    var proc = this.spawn(['cat-file', '-p', options.rev ? options.rev : 'HEAD:' + file]);

    // raise error on stream if the process errored
    proc.on('error', function (code, signal) {
        proc.stdout.emit('error', new RepoError(code, 'Error code:' + code + ' Signal:' + signal));
    });

    proc.on('exit', function (code, signal) {
        if (code !== 0) {
            return proc.stdout.emit('error', new RepoError(code, 'Error code:' + code + ' Signal:' + signal));
        }

        proc.stdout.emit('exit');
    });

    return proc.stdout;
};

function parseRawDiffLine(line, startPos) {
    assert(typeof line === 'string' && line.length !== 0);

    // :100644 100644 78681069871a08110373201344e5016e218604ea 8b58e26f01a1af730e727b0eb0f1ff3b33a79de2 M\0package.json\0[newpath\0]
    // pos records the position of each parts
    var pos = [ ];
    pos[0] = startPos + 1;
    pos[1] = line.indexOf(' ', pos[0]) + 1;
    pos[2] = line.indexOf(' ', pos[1]) + 1;
    pos[3] = line.indexOf(' ', pos[2]) + 1;
    pos[4] = line.indexOf(' ', pos[3]) + 1;
    pos[5] = line.indexOf('\0', pos[4]) + 1;
    pos[6] = line.indexOf('\0', pos[5]) + 1;

    var change = {
        oldRev: line.substr(pos[2], 40),
        rev: line.substr(pos[3], 40),
        oldMode: parseInt(line.substr(pos[0], 6), 8),
        mode: parseInt(line.substr(pos[1], 6), 8),
        status: '', // filled below
        oldPath: '', // filled below
        path: '' // filled below
    };

    switch (line.charAt(pos[4])) {
    case 'A': change.status = 'ADDED'; break;
    case 'C': change.status = 'COPIED'; break;
    case 'D': change.status = 'DELETED'; break;
    case 'M': change.status = 'MODIFIED'; break;
    case 'R': change.status = 'RENAMED'; break;
    case 'T': change.status = 'MODECHANGED'; break;
    case 'U': case 'X': // internal error
        return null;
    }

    if (change.status === 'Renamed' || change.status === 'Copied') {
        change.oldPath = line.substr(pos[5], pos[6] - pos[5] - 1);
        pos[7] = line.indexOf('\0', pos[6]) + 1;
        change.path = line.substr(pos[6], pos[7] - pos[6] - 1);
        return { change: change, pos: pos[7] };
    } else {
        delete change.oldPath;
        change.path = line.substr(pos[5], pos[6] - pos[5] - 1);
        return { change: change, pos: pos[6] };
    }
}

function parseRawDiffLines(out) {
    var pos = 0;
    var changes = [ ];
    while (pos < out.length) {
        var result = parseRawDiffLine(out, pos);
        changes.push(result.change);
        pos = result.pos;
    }

    return changes;
}

Repo.prototype._getFileSizes = function (sha1s, callback) {
    var proc = this.spawn(['cat-file', '--batch-check']), data = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', function (d) { data += d; });
    proc.stdout.on('end', function () {
        var sizes = [ ];
        data.split('\n').forEach(function (line) {
            if (line.length === 0) return;
            var parts = line.split(' ');
            var sha1 = parts[0], size = parseInt(parts[2], 10);
            sizes.push(size);
        });
        callback(null, sizes);
    });
    proc.stdout.on('error', callback);

    proc.stdin.write(sha1s.join('\n'));
    proc.stdin.end('\n');
};

Repo.prototype.getRevisions = function (file, options, callback) {
    assert(typeof file === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var limit = options.limit || 10;
    var revisions = [ ], that = this;

    this.git(['log', '-z', '--no-abbrev', '--find-renames', '--pretty=' + LOG_LINE_FORMAT, '--raw', '-n', limit, '--', file], function (err, out) {
        if (err) return callback(err);
        var revisionBySha1 = { }, sha1s = [ ];

        var pos = 0;
        while (pos < out.length) {
            var logResult = parseLogLine(out, pos);
            var commit = logResult.commit;
            pos = logResult.pos;

            pos += 2; // skip over a \0 and a \n

            var diffResult = parseRawDiffLine(out, pos);
            var diff = diffResult.change;
            pos = diffResult.pos;

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
    assert(typeof treeish1 === 'string');
    assert(typeof treeish2 === 'string');
    assert(typeof callback === 'function');

    if (treeish1 === '') {
        // this is an empty tree to diff against. git mktree < /dev/null
        // for some reason --root doesn't work as expected
        treeish1 = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
    }

    this.git(['diff-tree', '-z', '-r', '--find-renames', treeish1, treeish2], function (err, out) {
        if (err) return callback(err);
        callback(null, parseRawDiffLines(out));
    });
};

Repo.prototype.metadata = function (filePath, options, callback) {
    assert(typeof filePath === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var rev = options.rev, hash = options.hash, that = this;

    if (!rev) {
        this.fileEntry(filePath, 'HEAD', function (err, entry) {
            if (err) return callback(err);
            if (entry.sha1 === hash) return callback(null);

            // Use the index to provide mtime information
            that.indexEntries({ path: filePath }, function (err, entries) {
                if (err) return callback(err);
                return callback(null, entries, entry.sha1);
            });
        });
    } else {
        // No easy way to provide mtime information. If this is needed we have to create an
        // alternate git tree structure which also contains the mtime.
        this.getTree(rev, { path: filePath }, function (err, tree) {
            if (err) return callback(err);
            return callback(null, tree.entries, tree.sha1); // no hash since rev'ed metadata never changes
        });
    }
};

Repo.prototype.hashObject = function (filePath, callback) {
    assert(typeof filePath === 'string');

    this.git(['hash-object', filePath], function (err, out) {
        if (err) return callback(err);
        callback(null, out.slice(0, -1));
    });
};

// can add or update a file
Repo.prototype.putFile = function (filePath, newFile, options, callback) {
    assert(typeof filePath === 'string');
    assert(typeof newFile === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var that = this;
    var overwrite = options.overwrite;
    var parentRev = options.parentRev;
    var getConflictFilenameSync = options.getConflictFilenameSync;

    this.fileEntry(filePath, 'HEAD', function (err, entry) {
        if (err) {
            if (err.code !== 'ENOENT') return callback(err);
            entry = null;
        }

        if (!entry) {
            if (options.parentRev) return callback(new RepoError('EINVAL', 'Invalid parent revision'));
            that.addFile(filePath, { file: newFile }, callback);
            return;
        }

        if (entry.sha1 === parentRev || overwrite) {
            that.updateFile(filePath, { file: newFile }, callback);
            return;
        }

        // check if the file is different
        that.hashObject(newFile, function (err, hash) {
            if (err) return callback(err);
            if (entry.sha1 === hash) { // file is unchanged
                that._addFileAndCommit(filePath, { _operation: "Unchanged" }, callback);
            } else {
                var newName = getConflictFilenameSync(filePath, that.checkoutDir);
                that.addFile(newName, { file: newFile }, callback);
            }
        });
    });
};
