'use strict';

var fs = require('fs'),
    HttpError = require('../httperror'),
    HttpSuccess = require('../httpsuccess'),
    mime = require('mime'),
    debug = require('debug')('server:routes/file'),
    express = require('express'),
    util = require('util'),
    path = require('path'),
    safe = require('safetydance');

exports = module.exports = {
    read: read,
    revisions: revisions,
    metadata: metadata,
    multipart: multipart,
    putFile: putFile
};

/**
 * @api {get} /api/v1/file/:volume/:filepath?rev=:revision getFile
 * @apiName getFile
 * @apiGroup file
 * @apiDescription
 * Outputs file with Content-Type set based on the file's extension.
 *
 * @apiParam {string} volume Volume ID
 * @apiParam {string} filepath Volume relative file path
 * @apiParam {string} revision Get the specific revision of the specified file
 *
 * @apiSuccess {Stream} content File content
 *
 * @apiError 404 File not available with this revision
 * @apiError 500 Stream error
 */
function read(req, res, next) {
    var filePath = req.params[0], rev = req.query.rev;

    req.volume.repo.metadata(filePath, { rev: rev }, function (err, entries, hash) {
        if (err) {
            if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
            return next(new HttpError(500, 'Error getting HEAD'));
        }

        var headers = {
            'Content-Type' : mime.lookup(filePath),
            'Content-Length': entries[0].size // not setting the Content-Length explicitly sends the data using chunked encoding
        };

        var file = req.volume.repo.createReadStream(filePath, { rev: rev });
        file.on('error', function (err) {
            if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
            return next(new HttpError(500, 'Stream error:' + err));
        });

        res.writeHead(200, headers);
        file.pipe(res);
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

        next(new HttpSuccess(200, { revisions: revisions }));
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

        if (!entries) {
            next(new HttpSuccess(304, {}));
        } else {
            next(new HttpSuccess(200, { entries: entries, hash: hash }));
        }
    });
}

/*
 * Add this to the route to allow multipart file uploads to be extracted to the repo's tmp dir.
 * This is required because rename() works only within the same file system.
 */
function multipart(req, res, next) {
    var parser = express.multipart({
        uploadDir: req.volume.tmpPath, // this makes rename() possible
        keepExtensions: true,
        maxFieldsSize: 2 * 1024, // only field size, not files
        limit: '521mb' // file sizes
    }); // multipart/form-data

    // increase timeout of file uploads to 3 mins
    if (req.clearTimeout) req.clearTimeout();
    express.timeout(3 * 60 * 1000)(req, res, function () { parser(req, res, next); });
}

function _getConflictFilenameSync(renamePattern, file, checkoutDir) {
    var idx = file.indexOf('.');
    var baseName = idx == -1 ? file : file.substr(0, idx);
    var ext = idx == -1 ? '' : file.substr(idx); // includes '.' if any

    for (var i = 0; true; i++) {
        file = util.format("%s-%s%s%s", baseName, renamePattern, i ? ' ' + i : '', ext);
        if (!safe.fs.existsSync(path.join(checkoutDir, file))) break;
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
    var data = safe.JSON.parse(req.body.data);
    if (!data) {
        return next(new HttpError(400, 'Cannot parse data field:' + safe.error.message));
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
        next(new HttpSuccess(201, fileInfo));
    });
}
