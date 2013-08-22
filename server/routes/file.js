'use strict';

var fs = require('fs'),
    HttpError = require('../httperror'),
    syncer = require('../syncer');

exports = module.exports = {
    initialize: initialize,
    listing: listing,
    read: read,
    update: update
};

function initialize(config) {
}

function listing(req, res, next) {
    res.send(sync.index.json());
}

function read(req, res, next) {
    var filePath = req.params[0];

    var file = req.repo.createReadStream(filePath);
    file.on('error', function (err) {
        if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
        return next(new HttpError(500, 'Stream error:' + err));
    });
    file.pipe(res);
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

