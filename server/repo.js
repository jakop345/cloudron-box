'use strict';

var exec = require('child_process').exec,
    debug = require('debug')('repo.js'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    fs = require('fs');

exports = module.exports = {
    initialize: initialize,
    head: null,
    tree: tree,
    fileChangeTime: fileChangeTime,
    isTracked: isTracked,
    mtime: mtime,
    commit: commit,
    create: create,
    addFile: addFile,
    updateFile: updateFile,
    removeFile: removeFile,
    createReadStream: createReadStream
};

var gitDir, checkoutDir;

function git(command, callback) {
    var options = {
        env: { GIT_DIR: gitDir },
        cwd: checkoutDir
    };
    debug('GIT_DIR=' + gitDir + ' git ' + command);
    exec('git ' + command, options, function (error, stdout, stderr) {
        if (error) return callback(error);
        return callback(null, stdout);
    });
}

function initialize(config, callback) {
    gitDir = config.root + '/.git';
    checkoutDir = config.root;

    updateHead(callback);
}

function updateHead(callback) {
    git('rev-parse HEAD', function (err, sha1) {
        if (err) return callback(err);
        exports.head = sha1.slice(0, -1);
        callback();
    });
}

function create(options, callback) {
    git('init', function (err) {
        if (err) return callback(err);
        git('config user.name ' + options.name + ' && git config user.email ' + options.email, callback);
    });
}

function commit(commit, callback) {
    git('show -s --pretty=%T,%ci,%P, ' + commit, function (err, out) {
        if (err) return callback(err);
        var parts = out.split(',');
        callback(null, { treeSha1: parts[0], commitDate: new Date(parts[1]), parentSha1: parts[2]});
    });
}

function tree(commit, callback) {
    if (commit == '') return callback(null, [ ]);

    git('ls-tree -r ' + commit, function (err, out) {
        var lines = out.split('\n');
        var entries = [ ];
        lines.forEach(function (line) {
            if (line == '') return;
            var id, mode, name, type, _ref;
            // sample line : 100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 README
            var parts = line.split(/[\t ]+/, 4);
            var mode = parts[0];
            entries.push({
                stat: { mode: parseInt(parts[0], 8) }, // match fs.Stat object
                sha1: parts[2],
                path: parts[3]
            });
        });
        callback(null, entries);
    });
}

function isTracked(file, callback) {
    git('ls-files --error-unmatch ' + file, function (err, out) {
        return callback(null, !err); // FIXME: check err.code
    });
}

function mtime(file, callback) {
    git('log --pretty=%ci -- ' + file, function (err, out) {
        if (err) return callback(null, 0);
        callback(null, new Date(out));
    });
}

function fileChangeTime(file, fromRev, toRev, callback) {
    if (typeof callback === 'undefined') {
        callback = toRev;
        toRev = fromRev;
        fromRev = '';
    }

    var cmd = fromRev == ''
        ? 'log ' + fromRev + ' --pretty=%ci -- '+ file
        : 'log ' + fromRev + '..' + toRev + ' --pretty=%ci -- ' + file;
    git(cmd, function (err, out) {
        if (err) return callback(err);
        if (out.length == 0) return callback(null);
        callback(null, new Date(out));
    });
}

function createCommit(message, callback) {
     git('commit -a -m \'' + message + '\'', function (err, out) {
        if (err) return callback(err);
        updateHead(function (err) {
            if (err) return callback(err);
            commit(exports.head, callback);
        });
     });
}

function addFile(file, options, callback) {
    // FIXME: ensure this is a new file
    if (!options.message) options.message = 'Adding file ' + file;
    mkdirp(path.dirname(file), function (ignoredErr) {
        fs.rename(options.path, path.join(checkoutDir, file), function (err) {
            if (err) return callback(err);
            git('add ' + file, function (err) {
                if (err) return callback(err);
                createCommit(options.message, callback);
            });
        });
    });
}

function updateFile(file, options, callback) {
    // FIXME: ensure this is an updated file
    if (!options.message) options.message = 'Updating file ' + file;
    fs.rename(options.path, path.join(checkoutDir, file), function (err) {
        if (err) return callback(err);
        git('add ' + file, function (err) {
            if (err) return callback(err);
            createCommit(options.message, callback);
        });
    });
}

function removeFile(file, callback) {
    var message = 'Removing file ' + file;
    fs.unlink(path.join(checkoutDir, file), function (err) {
        if (err) return callback(err);
        createCommit(message, callback);
    });
}

function createReadStream(file) {
    return fs.createReadStream(path.join(checkoutDir, file));
}

