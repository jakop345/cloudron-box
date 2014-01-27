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
    constants = require('constants'), // internal module? same as process.binding('constants')
    safe = require('safetydance');

exports = module.exports = Repo;

function RepoError(code, msg) {
    Error.call(this);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.code = code;
    this.message = msg;
}
util.inherits(RepoError, Error);

var NULL_SHA1 = '0000000000000000000000000000000000000000';

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

/*
 * Run git commands on this repo. This function waits for the git command to
 * complete and captures the complete stderr and stdout in two separate buffers.
 * If you want to process the output as a stream, use spawn() instead.
 */
Repo.prototype.git = function (args, callback) {
    assert(util.isArray(args));

    var stdout = '', stderr = ''; // FIXME: work with Buffer instead of strings
    var proc = this.spawn(args);
    proc.stdout.on('data', function (data) { stdout += data; });
    proc.stderr.on('data', function (data) { stderr += data; });
    proc.on('close', function (code, signal) { // close guarantess stdio streams are closed unlike 'exit'
        var error = code !== 0 ? new RepoError(code, code) : null;
        callback(error, stdout, stderr);
    });
    return proc;
};

/*
 * Run git commands on this repo. Unlike git(), this function returns the process
 * object. process.stderr and process.stdout are the error and output streams.
 */
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

/*
 * Returns the absolute file path of \arg filePath if it's part of this
 * repo. Returns null otherwise.
 */
Repo.prototype._absoluteFilePath = function (filePath) {
    var relativeFilePath = path.relative(this.gitDir, filePath);
    if (relativeFilePath.slice(0, 3) !== '../') return null; // inside .git

    var absoluteFilePath = path.resolve(this.checkoutDir, filePath);
    return absoluteFilePath.slice(0, this.checkoutDir.length) == this.checkoutDir
            ? absoluteFilePath
            : null; // the path is outside the repo
};

var LOG_LINE_FORMAT = '%T%x00%ct%x00%P%x00%B%x00%H%x00%an%x00%ae%x00';
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
        subject: line.slice(pos[3], pos[4] - 1), // contains raw subject and body
        sha1: line.slice(pos[4], pos[5] - 1),
        author: {
            name: line.slice(pos[5], pos[6] - 1),
            email: line.slice(pos[6], pos[7] - 1)
        }
    };

    return { commit: commit, pos: pos[7] };
}

/*
 * Returns a commit object with the following fields:
 *   treeSha1, commitDate, parentSha1, subject, sha1, author.name, author.email
 */
Repo.prototype.getCommit = function (commitish, callback) {
    assert(typeof commitish === 'string');
    assert(typeof callback === 'function');

    this.git(['show', '-z', '--raw', '-s', '--pretty=' + LOG_LINE_FORMAT, commitish], function (err, out) {
        if (err) return callback(err);
        callback(null, parseLogLine(out, 0).commit);
    });
};

/*
 * Creates a git repository associated with the given username and email.
 */
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
    var relPath = line.substr(endPos);

    return {
        mode: parseInt(parts[0], 8),
        size: parseInt(parts[3], 10) || 0, // for dirs, size field is '-' and parseInt will return NaN
        sha1: parts[2],
        path: relPath,
        name: path.basename(relPath)
    };
}

/*
 * Each tree entry contains:
 *   name - name of the file
 *   path - full path relative to the volume
 *   mode - integer
 *   size - integer
 *   sha1 - string
 * options can contain:
 *   path - filter by path
 *   listSubtrees - recursive list all files below path. When true,
 *     directories are not listed.
 */
Repo.prototype.getTree = function (treeish, options, callback) {
    assert(typeof treeish === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var tree = { entries: [ ] };

    if (treeish === '') return callback(null, tree);

    var path = options.path || '', listSubtrees = options.listSubtrees ? '-rt' : '';
    this.git(['ls-tree', '-z', '-l', listSubtrees, treeish, '--', path], function (err, out) {
        if (err) return callback(err);
        var lines = out.split('\0');
        lines.forEach(function (line) { if (line.length !== 0) tree.entries.push(parseTreeLine(line)); });
        callback(null, tree);
    });
};

/*
 * Return an arry of entries that contain:
 *   name - name of the file
 *   path - full path relative to the volume
 *   mode - integer
 *   size - integer
 *   sha1 - string
 *   mtime - integer
 * options can contain:
 *   path - filter by path
 *   listSubtrees - recursive list all files below path. When true,
 *     directories are not listed.
 */
Repo.prototype.listFiles = function (options, callback) {
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var that = this;

    this.getTree('HEAD', options, function (err, tree) {
        if (err) return callback(err);

        tree.entries.forEach(function (entry) {
            var stat = safe.fs.statSync(path.join(that.checkoutDir, entry.path)); // FIXME: make async
            if (!stat) return;
            entry.mtime = stat.mtime.getTime();
        });

        callback(null, tree);
    });
};

/*
 * Returns true if the file is part of the repo.
 */
Repo.prototype.isTracked = function (file, callback) {
    assert(typeof file === 'string');
    assert(typeof callback === 'function');

    this.git(['ls-files', '--error-unmatch', file], function (err, out) {
        return callback(null, !err);
    });
};

/*
 * Each file entry contains:
 *   name - name of the file
 *   path - full path relative to the volume
 *   mode - integer
 *   size - integer
 *   sha1 - string
 *   mtime - integer
 */
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
    var proc = this.git(['commit', '--allow-empty', '--cleanup=verbatim', '-a', '-F', '-'], function (err, out) {
        if (err) return callback(err);
        that.getCommit('HEAD', callback);
    });
    proc.stdin.end(message);
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
    var relPath = line.substr(endPos);

    return {
        mode: parseInt(parts[0], 8),
        sha1: parts[1],
        path: relPath,
        name: path.basename(relPath)
    };
}

Repo.prototype._addFileAndCommit = function (file, options, callback) {
    var that = this;
    this.git(['add', file], function (err) {
        if (err) return callback(err);
        that.git(['ls-files', '-z', '-s', '--', file], function (err, out) {
            if (err) return callback(err);
            var fileInfo = parseIndexLine(out.slice(0, -1));
            var message = options.message || (options._operation + ' ' + path.basename(file));
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

    // FIXME: make options.file come as function arg since it's mandatory param
    fs.rename(options.file, absoluteFilePath, function (err) {
        if (err) return callback(err);
        that._addFileAndCommit(file, options, callback);
    });
};

function parseIndexLines(out) {
    /*
        100644 81cc9ef1205995550f8faea11180a1ff7806ed81 0\twebadmin/volume-client.js\0ctime: 1376890412:0
          mtime: 1376890412:0
          dev: 2049 ino: 3391167
          uid: 1000 gid: 1000
          size: 3994    flags: 0
     */

    var entries = [ ];
    var startPos = 0;

    while (startPos < out.length) {
        var fileNameEndPos = out.indexOf('\0', startPos);
        if (fileNameEndPos == -1) break;

        var line2StartPos = out.indexOf('\n', fileNameEndPos) + 1;
        var mtimePos = out.indexOf(':', line2StartPos) + 1;
        var line3StartPos = out.indexOf('\n', line2StartPos) + 1;
        var line4StartPos = out.indexOf('\n', line3StartPos) + 1;
        var line5StartPos = out.indexOf('\n', line4StartPos) + 1;
        var sizePos = out.indexOf(':', line5StartPos) + 1;

        var entry = parseIndexLine(out.slice(startPos, fileNameEndPos));
        entry.mtime = parseInt(out.substr(mtimePos, 15), 10);
        entry.size = parseInt(out.substr(sizePos, 15), 10);

        entries.push(entry);

        startPos = out.indexOf('\n', line5StartPos) + 1;
    }

    return entries;
}

/*
 * Returns an array of index entries. Each index entry contains:
 *     mode, sha1, path, mtime, size, name
 */
Repo.prototype.indexEntries = function (options, callback) {
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    var path = options.path || ''; // FIXME: make this non-optional
    this.git(['ls-files', '-z', '-s', '--debug', '--', path], function (err, out) {
        if (err) return callback(err);
        callback(null, parseIndexLines(out));
    });
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

/*
 * Adds a file to the repo. Fails if a file already exists in the repo
 * Options can contain:
 *    message - commit message. default: 'Add <filename>'
 */
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

    if (safe.fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File already exists'));
    }

    options._operation = 'Add';

    mkdirp(path.dirname(absoluteFilePath), function (ignoredErr) {
        that._renameFileAndCommit(file, options, callback);
    });
};

/*
 * Updates an existing file in the repo.
 * Options can contain:
 *    message - commit message. default: 'Update <filename>'
 */
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

    if (!safe.fs.existsSync(absoluteFilePath)) {
        return callback(new RepoError('ENOENT', 'File does not exist'));
    }

    options._operation = 'Update';

    this._renameFileAndCommit(file, options, callback);
};

/*
 * Removes an existing file in the repo. Fails if path doesn't exist.
 * Options can contain:
 *    message - commit message. default: 'Remove <filename>'
 *    recursive - for directories, removes them recursively
 */
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

/*
 * Move (rename) a file from \arg from to \arg to. Options can contain:
 *    rev - revision of the from file that the client expects to be moved. default: latest
 */
Repo.prototype.moveFile = function (from, to, options, callback) {
    assert(typeof from === 'string');
    assert(typeof to === 'string');
    assert(typeof options === 'object' || typeof options === 'function');

    if (typeof options === 'function') {
        callback = options;
        options = { };
    }

    to = to === '' ? '.': to;

    var that = this;
    this.fileEntry(from, 'HEAD', function (err, entry) {
        if (err) return callback(err);
        var rev = options.rev || '*';

        if (entry.sha1 !== rev && rev !== '*') return callback(new RepoError('EOUTOFDATE', 'Out of date'));

        that.git(['mv', from, to], function (err, out) {
            if (err) return callback(new RepoError('ENOENT', 'File does not exist'));

            var message = 'Move from ' + from + ' to ' + to;
            // FIXME: When to is '.' this does a add and ls-files of '.'
            that._addFileAndCommit(to, { message: message }, callback);
        });
    });
};

/*
 * FIXME: this doesn't behave as documented below
 * Add a copy of a file from \arg from to \arg to. Options can contain:
 *    rev - revision of the from file to copy from. default: latest
 */
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

/*
 * Access contents of a file in the repo as a stream.
 * Options can contain:
 *    rev - the revision of the file (git-sha1). default: latest
 */
Repo.prototype.createReadStream = function (file, options) {
    assert(typeof file === 'string');
    options = options || { };

    var absoluteFilePath = this._absoluteFilePath(file);
    if (absoluteFilePath === null) {
        return fs.createReadStream(''); // this will trigger an ENOENT error
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

/*
 * Helper function parse a single diff line. A diff line is of the following format: 
 * :100644 100644 78681069871a08110373201344e5016e218604ea 8b58e26f01a1af730e727b0eb0f1ff3b33a79de2 M\0package.json\0[newpath\0]
 */
function parseRawDiffLine(line, startPos) {
    assert(typeof line === 'string' && line.length !== 0);

    // pos records the position of each parts
    var oldModePos = startPos + 1; // skip colon
    var modePos = line.indexOf(' ', oldModePos) + 1;
    var oldRevPos = line.indexOf(' ', modePos) + 1;
    var revPos = line.indexOf(' ', oldRevPos) + 1;
    var statusPos = line.indexOf(' ', revPos) + 1;
    var pathPos = line.indexOf('\0', statusPos) + 1;
    var maybeNewPathPos = line.indexOf('\0', pathPos) + 1;

    var change = {
        oldRev: line.substr(oldRevPos, 40),
        rev: line.substr(revPos, 40),
        oldMode: parseInt(line.substr(oldModePos, 6), 8),
        mode: parseInt(line.substr(modePos, 6), 8),
        status: '', // filled below
        oldPath: '', // filled below
        path: '' // filled below
    };

    switch (line.charAt(statusPos)) {
    case 'A': change.status = 'ADDED'; break;
    case 'C': change.status = 'COPIED'; break;
    case 'D': change.status = 'DELETED'; break;
    case 'M': change.status = 'MODIFIED'; break;
    case 'R': change.status = 'RENAMED'; break;
    case 'T': change.status = 'MODECHANGED'; break;
    case 'U': case 'X': // internal error
        return null;
    }

    if (change.status === 'RENAMED' || change.status === 'COPIED') {
        change.oldPath = line.substr(pathPos, maybeNewPathPos - pathPos - 1);
        var endPos = line.indexOf('\0', maybeNewPathPos) + 1;
        change.path = line.substr(maybeNewPathPos, endPos - maybeNewPathPos - 1);
        return { change: change, pos: endPos };
    } else {
        delete change.oldPath;
        change.path = line.substr(pathPos, maybeNewPathPos - pathPos - 1);
        return { change: change, pos: maybeNewPathPos };
    }
}

/*
 * Helper function parse multiple diff lines
 */
function parseRawDiffLines(out) {
    var pos = 0;
    var changes = [ ];
    while (pos < out.length) {
        var result = parseRawDiffLine(out, pos);
        if (result == null) break;
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

/*
 * Gets the revision history of a file. Options can contain:
 *   limit - max number of revisions to return. default: 10
 *
 * Each revision object contains:
 *   sha1: rev of the file (git-sha1 of the file)
 *   mode: mode of file at that revision
 *   path: path of the file. this could change if the file was a rename
 *   date: modification date
 *   author: modification author
 *   subject: modification subject,
 *   size: size of file
 */
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
            if (diffResult == null) break;

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

/*
 * Returns the changes between two revisions. Each change contains:
 *     oldRev, rev, oldMode, mode, status, oldPath, path
 */
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

/*
 * Returns the metadata of a file or directory. Options can contain:
 *    rev: the revision of the file/directory
 *    hash: the hash (FIXME: explain better)
 * The returned metadata contains:
 *    name, path, mode, size, sha1, mtime (only for HEAD)
 * FIXME: check how files/dirs are listed in output
 */
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

/*
 * Hashes the file at \arg filePath. The sha1 sum of a file is different
 * from the git hash of a file since git prepends file size and type
 * to the file contents.
 */
Repo.prototype.hashObject = function (filePath, callback) {
    assert(typeof filePath === 'string');

    this.git(['hash-object', filePath], function (err, out) {
        if (err) return callback(err);
        callback(null, out.slice(0, -1));
    });
};

/*
 * Add or update file at \arg filePath with \arg newFile.
 * \arg options can contain
 *    overwrite - Overwrite filePath if it already exists. default: false
 *    parentRev - Update file only if this is filePath's current revision.
 *    getConflictFilenameSync - Function called to provide alternate file name
 *      when there is a conflict. conflict can happen when parentRev is not
 *      specified and overwrite is false.
 */
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
    var parentRev = options.parentRev || NULL_SHA1;
    var getConflictFilenameSync = options.getConflictFilenameSync;

    this.fileEntry(filePath, 'HEAD', function (err, entry) {
        if (err) {
            if (err.code !== 'ENOENT') return callback(err);
            entry = null;
        }

        if (!entry) {
            if (parentRev !== NULL_SHA1) {
                return callback(new RepoError('EINVAL', 'Invalid parent revision'));
            }
            that.addFile(filePath, { file: newFile }, callback);
            return;
        }

        // TODO: Code below implies that if you uploade the same file again with parentRev
        // set, we will not detect it as 'Unchanged'. This should be fixed by making the
        // upload parser automatically compute sha1 as the blob comes in.
        if (entry.sha1 === parentRev || overwrite) {
            that.updateFile(filePath, { file: newFile }, callback);
            return;
        }

        // check if the file is different before reporting a conflict
        // we need this check because the file can be the same which might happen
        // when a client starts out fresh (parentRev is null)
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
