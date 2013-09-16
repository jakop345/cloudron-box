'use strict';

var fs = require('fs'),
    HttpError = require('../httperror');

exports = module.exports = {
    remove: remove,
    move: move,
    copy: copy
};

function remove(req, res, next) {
    var filePath = req.method === 'DELETE' ? req.params[0] : req.body.path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    if (!rev) return next(new HttpError(400, 'No revision specified'));

    repo.fileEntry(filePath, 'HEAD', function (err, fileEntry) {
        if (err) {
            if (err.code === 'ENOENT') return next(new HttpError(400, 'No such file'));
            return next(new HttpError(500, 'Internal error'));
        }

        if (fileEntry.sha1 !== rev && rev !== '*') return next(new HttpError(409, 'Out of date'));

        repo.removeFile(filePath, { recursive: true }, function (err, commit) {
            if (err) {
                if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
                return next(new HttpError(500, err.message));
            }
            res.send(200, fileEntry);
        });
    });
}

function move(req, res, next) {
    var fromPath = req.body.from_path, toPath = req.body.to_path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    if (!fromPath) return next(400, 'from_path not specified');
    if (!toPath) return next(400, 'to_path not specified');
    if (!rev) return next(new HttpError(400, 'No revision specified'));

    repo.fileEntry(fromPath, 'HEAD', function (err, fileEntry) {
        if (err) {
            if (err.code === 'ENOENT') return next(new HttpError(400, 'No such file'));
            return next(new HttpError(500, 'Internal error'));
        }

        if (fileEntry.sha1 !== rev && rev !== '*') return next(new HttpError(409, 'Out of date'));

        repo.moveFile(fromPath, toPath, function (err, newEntry, commit) {
            if (err) {
                if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
                return next(new HttpError(500, err.message));
            }
            res.send(200, newEntry);
        });
    });
}

function copy(req, res, next) {
    var fromPath = req.body.from_path, toPath = req.body.to_path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    if (!fromPath) return next(400, 'from_path not specified');
    if (!toPath) return next(400, 'to_path not specified');
    if (!rev) return next(new HttpError(400, 'No revision specified'));

    repo.fileEntry(fromPath, 'HEAD', function (err, fileEntry) {
        if (err) {
            if (err.code === 'ENOENT') return next(new HttpError(400, 'No such file'));
            return next(new HttpError(500, 'Internal error'));
        }

        if (fileEntry.sha1 !== rev && rev !== '*') return next(new HttpError(409, 'Out of date'));

        repo.copyFile(fromPath, toPath, function (err, newEntry, commit) {
            if (err) {
                if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
                return next(new HttpError(500, err.message));
            }
            res.send(200, newEntry);
        });
    });
}

