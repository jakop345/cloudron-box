'use strict';

var fs = require('fs'),
    HttpError = require('../httperror'),
    mime = require('mime'),
    debug = require('debug')('file.js'),
    express = require('express'),
    util = require('util'),
    path = require('path');

exports = module.exports = {
    read: read,
    revisions: revisions,
    metadata: metadata,
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
}

/*
 * Put a file using multipart file upload
 * @urlparam {string} path The path of the file
 * @bodyparam {string} parentRev The parent revision of the file (default: latest)
 * @bodyparam {bool} overwrite Overwrite file (default: true)
 * @bodyparam {file} file contents 
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
        res.send(201, fileInfo);
    });
}
