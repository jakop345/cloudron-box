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

/*
 * Outputs file with Content-Type set based on the file's extension.
 * @uriparam {string} path The path of the file
 * @queryparam {string} rev The revision of the file
 */
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

/*
 * Outputs revision of a file.
 * @uriparam {string} path The path of the file
 * @queryparam {number} limit The number of revisions (default: 10)
 * @return {revision}
 *
 * A revision object contains the following:
 *  sha1, mode, path, date, author, subject, size
 */
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

/*
 * Outputs the metadata of a file.
 * @uriparam {string} path The path of the file
 * @queryparam {string} rev The revision for which metadata is requested (default: current revision)
 * @queryparam {string} hash The revision since the last metadata query was made
 * @return {metadata}
 *
 * A metadata object contains the following
 *   [entries], hash
 *
 * For directories, hash is the tree sha1. For files, hash is the same as the revision of the file.
 *
 * An entry object contains the following:
 *   sha1, mode, path, mtime, size
 */
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

/*
 * Add this to the route to allow multipart file uploads to be extracted to the repo's tmp dir.
 * This is required because rename() works only within the same file system.
 */
function multipart(req, res, next) {
    var parser = express.multipart({ uploadDir: req.volume.tmpPath, keepExtensions: true, maxFieldsSize: 2 * 1024 * 1024 }); // multipart/form-data
    parser(req, res, next);
}

function _getConflictFilenameSync(renamePattern, file, checkoutDir) {
    var idx = file.indexOf('.');
    var baseName = idx == -1 ? file : file.substr(0, idx);
    var ext = idx == -1 ? '' : file.substr(idx); // includes '.' if any

    for (var i = 0; true; i++) {
        file = util.format("%s-%s%s%s", baseName, renamePattern, i ? ' ' + i : '', ext);
        if (!fs.existsSync(path.join(checkoutDir, file))) break;
    }
    return file;
};

/*
 * Put a file using multipart file upload
 * @urlparam {string} path The path of the file
 * @bodyparam {string} parentRev The parent revision of the file (default: latest)
 * @bodyparam {bool} overwrite Overwrite file (default: true)
 * @bodyparam {data} file contents 
 *
 * The file can already exist, in which case it's renamed after uploaded.
 *
 */
function putFile(req, res, next) {
    var data;
    try {
        data = JSON.parse(req.body.data);
    } catch (e) {
        return next(new HttpError(400, 'Cannot parse data field:' + e.message));
    }

    if (!req.files.file) return next(new HttpError(400, 'file not provided'));

    var filePath = req.params[0];
    var options = {
        parentRev: data.parentRev,
        overwrite: data.overwrite,
        getConflictFilenameSync: _getConflictFilenameSync.bind(null, 'ConflictedCopy')
    };

    req.volume.repo.putFile(filePath, req.files.file.path, options, function (err, fileInfo, commit) {
        if (err) {
            if (err.code === 'EINVAL') return next(new HttpError(400, 'Invalid data'));
            return next(new HttpError(500, 'Error putting file : ' + err.message));
        }
        fileInfo.serverRevision = commit.sha1;
        res.send(200, fileInfo);
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
        if (err) {
            if (err.code !== 'ENOENT') return next(new HttpError(400, 'input error:' + err));
            baseEntry = null;
        }

        repo.fileEntry(leftEntry.path, 'HEAD', function (err, rightEntry) {
            if (err) {
                if (err.code !== 'ENOENT') return next(new HttpError(500, 'failed to get fileEntry:' + err));
                rightEntry = null;
            }

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

