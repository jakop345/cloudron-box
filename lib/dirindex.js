'use strict';

var fs = require('fs'), crypto = require('crypto'),
    async = require('async'), readdirp = require('readdirp');

function DirIndex(root) {
    this.root = root;
    this.entries = [ ];
}

function sha1(filePath, callback) {
    var sha1sum = crypto.createHash('sha1');
    var s;

    try {
        s = fs.createReadStream(filePath);
    } catch (e) {
        return callback(e);
    }
    s.on('data', function(d) { sha1sum.update(d); });
    s.on('end', function() { callback(null, sha1sum.digest('hex')); });
}

DirIndex.prototype.save = function (filename, callback) {
    var out;

    try {
        out = JSON.stringify(this.entries);
    } catch (e) {
        if (callback) return callback(e);
    }

    fs.writeFile(filename, out, function (error, result) {
        // ignore the result
        if (callback) return callback(error);
    });
};

DirIndex.prototype.load = function (filename, callback) {
    var that = this;

    fs.readFile(filename, function (error, result) {
        if (error) {
            if (callback) return callback(error);
        }

        try {
            that.entries = JSON.parse(result);
        } catch (e) {
            if (callback) return callback(e);
        }

        callback();
    });
};

DirIndex.prototype.addEntry = function (fileEntry, callback) {
    var that = this;
    sha1(fileEntry.fullPath, function (err, sha1) {
        if (err) return callback(err);
        that.entries.push({
            filename: fileEntry.path,
            size: fileEntry.stat.size,
            checksum: sha1,
            ctime: fileEntry.stat.ctime,
            mtime: fileEntry.stat.mtime
        });
        callback(null);
    });
};

DirIndex.prototype.build = function (callback) {
    var that = this;
    readdirp({ root: this.root }, function (err, result) {
        if (err) return callback(err);
        var fileEntries = result.files;

        fileEntries.sort(function (a, b) {
            if (a.path > b.path) return 1;
            if (a.path < b.path) return -1;
            return 0;
        });

        async.eachSeries(fileEntries, function (fileEntry, callback) {
            that.addEntry(fileEntry, callback);
        }, callback);
    });
};

DirIndex.diff = function (leftIndex, rightIndex) {
    var i = 0, j = 0, removed = [ ], added = [ ], modified = [ ];
    var left = leftIndex.entries, right = rightIndex.entries;

    while (i < left.length && j < right.length) {
        if (left[i].filename == right[j].filename) {
            if (left[i].size != right[j].size || left[i].checksum != right[j].checksum) {
                modified.push(right[j]);
            }
            ++i;
            ++j;
        } else if (left[i].filename > right[j].filename) {
            added.push(right[j]);
            ++j;
        } else {
            removed.push(left[i]);
            ++i;
        }
    }

    for (; i < left.length; i++) removed.push(left[i]);
    for (; j < right.length; j++) added.push(right[j]);

    return { added: added, removed: removed, modified: modified };
};

module.exports = {
    DirIndex: DirIndex
};

