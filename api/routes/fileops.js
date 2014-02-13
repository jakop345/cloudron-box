'use strict';

var HttpError = require('../httperror'),
    HttpSuccess = require('../httpsuccess');

exports = module.exports = {
    remove: remove,
    move: move,
    copy: copy
};

/*
 * Removes a file or directory
 * @bodyparam {string} path The path of the file (for 'POST' requests)
 * @bodyparam {string} rev The last known revision of the file
 *
 * The delete succeeds only if rev is set to the latest revision or '*'.
 */
function remove(req, res, next) {
    var filePath = req.body.path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    if (!filePath) return next(new HttpError(400, 'No path specified'));
    if (!rev) return next(new HttpError(400, 'No revision specified'));

    repo.removeFile(filePath, { recursive: true, rev: rev }, function (err, fileEntry, commit) {
        if (err) {
            // Removing a non-existent path is considered success. This is inline with idempotency of remove operation
            if (err.code == 'ENOENT' || err.code == 'ENOTDIR') {
                return next(new HttpSuccess(204, {}));
            }
            if (err.code == 'EOUTOFDATE') return next(new HttpError(409, 'Out of date'));
            return next(new HttpError(500, err.message));
        }
        fileEntry.serverRevision = commit.sha1;
        next(new HttpSuccess(200, fileEntry));
    });
}

/*
 * Moves a file or directory
 * @bodyparam {string} from_path The source path
 * @bodyparam {string} to_path The destination path
 * @bodyparam {string} rev The last known revision of the file
 *
 * The move succeeds only if rev is set to the latest revision or '*'.
 */
function move(req, res, next) {
    var fromPath = req.body.from_path, toPath = req.body.to_path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    if (!fromPath) return next(new HttpError(400, 'from_path not specified'));
    if (typeof toPath === 'undefined') return next(new HttpError(400, 'to_path not specified')); // to_path can be ""
    if (!rev) return next(new HttpError(400, 'No revision specified'));

    repo.moveFile(fromPath, toPath, { rev: rev }, function (err, newEntry, commit) {
        if (err) {
            if (err.code == 'ENOENT' || err.code == 'ENOTDIR') return next(new HttpError(404, 'Not found'));
            if (err.code == 'EOUTOFDATE') return next(new HttpError(409, 'Out of date'));
            return next(new HttpError(500, err.message));
        }
        newEntry.serverRevision = commit.sha1;
        next(new HttpSuccess(200, newEntry));
    });
}

/*
 * Copies a file or directory
 * @bodyparam {string} from_path The source path
 * @bodyparam {string} to_path The destination path
 * @bodyparam {string} rev The last known revision of the file
 *
 * The copy succeeds only if rev is set to the latest revision or '*'.
 */
function copy(req, res, next) {
    var fromPath = req.body.from_path, toPath = req.body.to_path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    if (!fromPath) return next(new HttpError(400, 'from_path not specified'));
    if (typeof toPath === 'undefined') return next(new HttpError(400, 'to_path not specified'));
    if (!rev) return next(new HttpError(400, 'No revision specified'));

    repo.copyFile(fromPath, toPath, { rev: rev }, function (err, newEntry, commit) {
        if (err) {
            if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return next(new HttpError(404, 'Not found'));
            if (err.code === 'EOUTOFDATE') return next(new HttpError(409, 'Out of date'));
            return next(new HttpError(500, err.message));
        }
        newEntry.serverRevision = commit.sha1;
        next(new HttpSuccess(200, newEntry));
    });
}
