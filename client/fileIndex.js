'use strict';

var fs = require('fs'),
    readdirp = require('readdirp'),
    debug = require('debug')('index.js'),
    assert = require('assert'),
    Lock = require('../lib/lock'),
    crypto = require('crypto');

exports = module.exports = FileIndex;

function FileIndex(dataDir) {
    this._dataDir = dataDir;
    this._indexFile = dataDir + '/.index';
    this._entries = [ ];
    this._entryHash = { };
    this._lock = new Lock();
}

FileIndex.prototype.addFile = function (entry) {
    debug('+', entry.path, 'sha1:', entry.sha1);
    entry.dirty = false; // FIXME: store this outside the entry object so it's not sent to server
    this._entries.push(entry);
    this._entryHash[entry.path] = entry;
    return entry;
};

FileIndex.prototype.removeFile = function (path, pos) {
    debug('- ', path);
    this._entries.splice(pos, 1);
    delete this._entryHash[path];
};

function cleanStat(stat) {
    return { mtime: stat.mtime, size: stat.size, mode: stat.mode };
}

FileIndex.prototype.addFilesWithoutHashing = function (callback) {
    var that = this;
    var dirStream = readdirp({ root: this._dataDir });
    dirStream.on('data', function (entry) {
        that.addFile({ path: entry.path, sha1: '', stat: cleanStat(entry.stat) });
    })
    dirStream.on('end', function () {
        debug('done');
        callback();
    });
};

FileIndex.prototype._markAllDirty = function () {
    this._entries.forEach(function (entry) { entry.dirty = true; });
};

// FIXME: make this async
function computeSha1(file) {
    var hasher = crypto.createHash('sha1');
    var contents = fs.readFileSync(file);
    hasher.update(contents);
    return hasher.digest('hex');
}

function isDifferent(indexEntry, fileEntry) {
    return fileEntry.stat.mtime.getTime() != indexEntry.stat.mtime.getTime()
           || fileEntry.stat.size != indexEntry.stat.size
           || fileEntry.stat.mode != indexEntry.stat.mode;
}

FileIndex.prototype.updateIndex = function (callback) {
    var that = this;
    var dirStream = readdirp({ root: this._dataDir });
    this._markAllDirty();
    debug('updating index');
    dirStream.on('data', function (fileEntry) {
        var indexEntry = that._entryHash[fileEntry.path];
        if (!indexEntry) { // this is a new file
            indexEntry = that.addFile({ path: fileEntry.path, sha1: '', stat: cleanStat(fileEntry.stat) });
            return;
        }

        indexEntry.dirty = false;

        if (!isDifferent(indexEntry, fileEntry)) return; // nothing changed with the file

        if (indexEntry.sha1 === '') {
            // was new file, so just update stat info. rename candidates will be hashed
            // in the 'end' handler
            indexEntry.stat = cleanStat(fileEntry.stat);
            debug('~', indexEntry.path);
        } else { // file changed
            indexEntry.sha1 = computeSha1(fileEntry.fullPath);
            debug('~', indexEntry.path, 'sha1:', indexEntry.sha1);
        }
    });
    dirStream.on('end', function () {
        // process dirty entries. dirty entries have basically been removed from the fs
        // if we detect the missing file is because of a rename, then we need the compute
        // the hash of the rename candidate. the server can detect renames only if we provide
        // the hash
        for (var pos = that._entries.length - 1; pos >= 0; --pos) {
            var indexEntry = that._entries[pos];
            if (!indexEntry.dirty) continue;
            that.removeFile(indexEntry.path, pos);

            // check for renames
            if (indexEntry.sha1 === '') continue; // the server has never seen this file
            // 1. detect simple renames by filename
            // 2. detect rename by content hash
            // 3. detect rename by similarity
        }
        debug('done updating');
        callback();
    });
};

FileIndex.prototype.sync = function (callback) {
    debug('syncing');
    if (this._entries.length == 0) { // is this never_run?
        debug('first run');
        return this.addFilesWithoutHashing(callback);
    }

    this._lock.run(this.updateIndex.bind(this), callback);
};

FileIndex.prototype.save = function () {
    fs.writeFileSync(this._indexFile, JSON.stringify(this._entries));
};

FileIndex.prototype.load = function () {
    try {
        var that = this;
        var contents = fs.readFileSync(this._indexFile);
        this._entries = JSON.parse(contents);
        this._entries.forEach(function (entry) { that._entryHash[entry.path] = entry; });
    } catch (e) {
        debug('corrupt or missing index');
    }
};

FileIndex.prototype.sortedEntryList = function () {
    this._entries.sort(function (a, b) {
        if (a.path > b.path) return 1;
        if (a.path < b.path) return -1;
        return 0;
    });
    return this._entries;
};

FileIndex.prototype.jsonObject = function () {
    return this._entries;
};

FileIndex.prototype.print = function () {
    console.log('index length: ', this._entries.length);
    this._entries.forEach(function (entry) { console.log('  ' + entry.path + ' sha1:' + (entry.sha1 == '' ? 'null' : entry.sha1)); });
};

FileIndex.prototype.mtime = function (path) {
    return this._entries[path].stat.mtime;
};

