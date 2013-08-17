'use strict';

var exec = require('child_process').exec,
    debug = require('debug')('repo.js');

exports = module.exports = {
    initialize: initialize,
    head: null,
    tree: tree,
    fileChangeTime: fileChangeTime,
    isTracked: isTracked,
    mtime: mtime,
    commit: commit
};

var gitDir;

function git(command, callback) {
    var options = {
        env: { GIT_DIR: gitDir }
    };
    debug('git ' + command);
    exec('git ' + command, options, function (error, stdout, stderr) {
        if (error) return callback(error);
        return callback(null, stdout);
    });
}

function initialize(config, callback) {
    gitDir = config.root + '/.git';

    git('rev-parse HEAD', function (err, sha1) {
        if (err) return callback(err);
        exports.head = sha1.slice(0, -1);
        callback();
    });
}

function commit(commit, callback) {
    git('show -s --pretty=%T,%ci ' + commit, function (err, out) {
        if (err) return callback(err);
        var parts = out.split(',');
        callback(null, { treeSha1: parts[0], commitDate: new Date(parts[1])});
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
        if (err) return callback(err);
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

