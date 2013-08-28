'use strict';

var fs = require('fs'),
    HttpError = require('../httperror'),
    syncer = require('../syncer'),
    mime = require('mime'),
    debug = require('debug')('file.js'),
    express = require('express');

exports = module.exports = {
    read: read,
    update: update,
    multipart: multipart
};

function read(req, res, next) {
    var filePath = req.params[0], rev = req.query.rev;

    var file = req.repo.createReadStream(filePath, { rev: rev });
    // not setting the Content-Length explicitly sends the data using chunked encoding
    res.writeHead(200, { 'Content-Type' : mime.lookup(filePath) });
    file.pipe(res);

    file.on('error', function (err) {
        if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
        return next(new HttpError(500, 'Stream error:' + err));
    });
}

function multipart(req, res, next) {
    var parser = express.multipart({ uploadDir: req.volume.tmpDir, keepExtensions: true, maxFieldsSize: 2 * 1024 * 1024 }); // multipart/form-data
    parser(req, res, next);
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

    var leftEntry = data.entry, repo = req.repo;

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

