'use strict';

var exec = require('child_process').exec,
    debug = require('debug')('repo.js');

exports = module.exports = {
    initialize: initialize,
    head: null,
    tree: tree
};

var gitDir;

function git(command, callback) {
    var options = {
        env: { GIT_DIR: gitDir }
    };
    exec('git ' + command, options, function (error, stdout, stderr) {
        if (error) return callback(error);
        return callback(null, stdout);
    });
}

function initialize(config, callback) {
    gitDir = config.root + '/.git';

    git('rev-parse HEAD', function (err, sha1) {
        if (err) return callback(err);
        exports.head = sha1;
        callback();
    });
}

function tree(treeish, callback) {
    git('ls-tree -r ' + treeish, function (err, out) {
        var lines = out.split('\n');
        var entries = [ ];
        lines.forEach(function (line) {
            var id, mode, name, type, _ref;
            // sample line : 100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 README
            var parts = line.split(/[\t ]+/, 4);
            var mode = parts[0], type = parts[1], name = parts[3];
            entries.push({
                stat: { mode: parseInt(parts[0], 8) }, // match fs.Stat object
                sha1: parts[2],
                path: parts[3]
            });
        });
        callback(null, entries);
    });
}

