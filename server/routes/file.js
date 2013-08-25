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
    var filePath = req.params[0];

    var file = req.repo.createReadStream(filePath);
    file.on('open', function () {
        // not setting the Content-Length explicitly sends the data using chunked encoding
        res.writeHead(200, { 'Content-Type' : mime.lookup(filePath) });
        file.pipe(res);
    });
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
    if (!req.body.data) return next(new HttpError(400, 'data field missing'));
    var data;

    try {
        data = JSON.parse(req.body.data);
    } catch (e) {
        return next(new HttpError(400, 'cannot parse data field:' + e.message));
    }

    if (!data.entry || !data.entry.path) return next(new HttpError(400, 'path not specified'));
    if (!data.entry.sha1) return next(new HttpError(400, 'sha1 not specified'));
    if (!data.entry.stat || !data.entry.stat.mtime) return next(new HttpError(400, 'mtime not specified'));

    if (!data.action) return next(new HttpError(400, 'action not specified'));
    if (!data.lastSyncRevision) return next(new HttpError(400, 'lastSyncRevision not specified'));

    if (data.action == 'add' || data.action == 'update') {
        if (!req.files.file) return next(new HttpError(400, 'file not provided'));
    } else if (data.action != 'remove') {
        res.send(new HttpError(400, 'Unknown action'));
    }

    console.log('Processing ', data);

    var leftEntry = data.entry;

    repo.fileEntry(leftEntry.path, data.lastSyncRevision, function (err, baseEntry) {
        if (err) return next(new HttpError(400, 'File does not exist at lastSyncRevision'));
        repo.fileEntry(leftEntry.path, 'HEAD', function (err, rightEntry) {
            if (err) return next(new HttpError(400, 'File does not exist in HEAD'));
            var change = whatChanged(leftEntry, baseEntry, rightEntry);
            if (conflict.length != 0) return next(new HttpError(409, JSON.stringify(conflict)));

            // actually update the file!
            if (data.action == 'add' || data.action == 'update') {
                repo.addFile(data.path, req.files.file.path, function (err, fileSha1, commit) {
                    if (err) return next(new HttpError(500, err.toString()));
                    res.send(200, { serverRevision: commit.sha1, fileRevision: fileSha1, canFastForward: commit.parentSha1 == data.lastSyncRevision });
                });
            } else if (data.action == 'remove') {
                repo.removeFile(data.path, function (err, commit) {
                    if (err) return next(new HttpError(500, err.toString()));
                    res.send(200, { serverRevision: commit.sha1, canFastForward: commit.parentSha1 == data.lastSyncRevision });
                });
            }
        });
    });
}

