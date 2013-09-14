'use strict';

var fs = require('fs'),
    HttpError = require('../httperror'),
    syncer = require('../syncer'),
    mime = require('mime'),
    debug = require('debug')('file.js'),
    express = require('express'),
    util = require('util'),
    path = require('path');

exports = module.exports = {
    read: read,
    revisions: revisions,
    metadata: metadata,
    update: update,
    multipart: multipart,
    putFile: putFile
};

function read(req, res, next) {
    var filePath = req.params[0], rev = req.query.rev;

    var file = req.volume.repo.createReadStream(filePath, { rev: rev });
    // not setting the Content-Length explicitly sends the data using chunked encoding
    res.writeHead(200, { 'Content-Type' : mime.lookup(filePath) });
    file.pipe(res);

    file.on('error', function (err) {
        if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
        return next(new HttpError(500, 'Stream error:' + err));
    });
}

function revisions(req, res, next) {
    var filePath = req.params[0], limit = req.query.limit || 10;

    req.volume.repo.getRevisions(filePath, { limit: limit }, function (err, revisions) {
        if (err) {
            if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
            return next(new HttpError(500, 'Revision error:' + err));
        }

        res.send(200, { revisions: revisions });
    });
}

function metadata(req, res, next) {
    var filePath = req.params[0], rev = req.query.rev, hash = req.query.hash;

    req.volume.repo.metadata(filePath, { rev: rev, hash: hash }, function (err, entries, hash) {
        if (err) {
            if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
            return next(new HttpError(500, 'Error getting HEAD'));
        }

        if (!entries) return res.send(304, 'Not modified');
        res.send(200, { entries: entries, hash: hash });
    });
}

function multipart(req, res, next) {
    var parser = express.multipart({ uploadDir: req.volume.tmpPath, keepExtensions: true, maxFieldsSize: 2 * 1024 * 1024 }); // multipart/form-data
    parser(req, res, next);
}

function _getRenameFilename(file, checkoutDir, renamePattern) {
    var idx = file.indexOf('.');
    var baseName = idx == -1 ? file : file.substr(0, idx);
    var ext = idx == -1 ? '' : file.substr(idx); // includes '.' if any

    for (var i = 0; true; i++) {
        file = util.format("%s-%s%s%s", baseName, renamePattern, i ? ' ' + i : '', ext);
        if (!fs.existsSync(path.join(checkoutDir, file))) break;
    }
    return file;
};

function putFile(req, res, next) {
    var data;
    try {
        data = JSON.parse(req.body.data);
    } catch (e) {
        return next(new HttpError(400, 'Cannot parse data field:' + e.message));
    }

    if (!req.files.file) return next(new HttpError(400, 'file not provided'));

    var filePath = req.params[0];
    var parentRev = data.parentRev;
    var overwrite = data.overwrite;

    req.volume.repo.fileEntry(filePath, 'HEAD', function (err, entry) {
        if (err) return next(new HttpError(400, 'Error getting fileEntry' + e));
        if (!entry) {
            if (data.parentRev) return next(new HttpError(400, 'No such revision'));
            req.volume.repo.addFile(filePath, { file: req.files.file.path }, function (err, fileInfo, commit) {
                if (err) return next(new HttpError(500, 'Error adding file'));
                fileInfo.serverRevision = commit.sha1;
                res.send(200, fileInfo);
            });
        } else {
            if (entry.sha1 === parentRev || overwrite) {
                req.volume.repo.updateFile(filePath, { file: req.files.file.path }, function (err, fileInfo, commit) {
                    if (err) return next(new HttpError(500, 'Error updating file'));
                    fileInfo.serverRevision = commit.sha1;
                    res.send(200, fileInfo);
                });
            } else {
                var newName = _getRenameFilename(filePath, req.volume.repo.checkoutDir, 'ConflictedCopy');
                req.volume.repo.addFile(newName, { file: req.files.file.path }, function (err, fileInfo, commit) {
                    if (err) return next(new HttpError(500, 'Error adding file'));
                    fileInfo.serverRevision = commit.sha1;
                    res.send(200, fileInfo);
                });
            }
        }
    });
}

function update(req, res, next) {
    // FIXME: grab path from req.params[0] ?
    if (!req.body.data) return next(new HttpError(400, 'data field missing'));
    var data;

    try {
        data = JSON.parse(req.body.data);
    } catch (e) {
        return next(new HttpError(400, 'cannot parse data field:' + e.message));
    }

    if (!data.entry || !data.entry.path) return next(new HttpError(400, 'path not specified'));

    if (!data.action) return next(new HttpError(400, 'action not specified'));
    if (!('lastSyncRevision' in data)) return next(new HttpError(400, 'lastSyncRevision not specified'));

    if (data.action == 'add' || data.action == 'update') {
        if (!req.files.file) return next(new HttpError(400, 'file not provided'));
        if (!data.entry.mtime) return next(new HttpError(400, 'mtime not specified'));
    } else if (data.action != 'remove') {
        res.send(new HttpError(400, 'Unknown action'));
    }

    debug('Processing ', data);

    var leftEntry = data.entry, repo = req.volume.repo;

    repo.fileEntry(leftEntry.path, data.lastSyncRevision, function (err, baseEntry) {
        if (err) return next(new HttpError(400, 'input error:' + err));
        repo.fileEntry(leftEntry.path, 'HEAD', function (err, rightEntry) {
            if (err) return next(new HttpError(500, 'failed to get fileEntry:' + err));
            var change = syncer.whatChanged(data.action != 'remove' ? leftEntry : null, baseEntry, rightEntry);
            if (change.conflict) return next(new HttpError(409, JSON.stringify(change)));

            // actually update the file!
            if (data.action == 'add') {
                repo.addFile(leftEntry.path, { file: req.files.file.path }, function (err, fileInfo, commit) {
                    if (err) {
                        if (err.code == 'ENOENT') return next(new HttpError(404, 'File not found'));
                        return next(new HttpError(500, err.toString()));
                    }
                    res.send(201, { serverRevision: commit.sha1, sha1: fileInfo.sha1, fastForward: commit.parentSha1 === data.lastSyncRevision });
                });
            } else if (data.action == 'update') {
                repo.updateFile(leftEntry.path, { file: req.files.file.path }, function (err, fileInfo, commit) {
                    if (err) {
                        if (err.code == 'ENOENT') return next(new HttpError(404, 'File not found'));
                        return next(new HttpError(500, err.toString()));
                    }
                    res.send(201, { serverRevision: commit.sha1, sha1: fileInfo.sha1, fastForward: commit.parentSha1 === data.lastSyncRevision });
                });
            } else if (data.action == 'remove') {
                repo.removeFile(leftEntry.path, function (err, commit) {
                    if (err) {
                        if (err.code == 'ENOENT') return next(new HttpError(404, 'File not found'));
                        return next(new HttpError(500, err.toString()));
                    }
                    res.send(200, { serverRevision: commit.sha1, fastForward: commit.parentSha1 === data.lastSyncRevision });
                });
            }
        });
    });
}

