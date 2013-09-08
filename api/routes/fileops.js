'use strict';

var fs = require('fs'),
    HttpError = require('../httperror');

exports = module.exports = {
    remove: remove
};

function remove(req, res, next) {
    var filePath = req.method === 'DELETE' ? req.params[0] : req.body.path;
    var repo = req.volume.repo;
    var rev = req.body.rev;

    repo.fileEntry(filePath, 'HEAD', function (err, fileEntry) {
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

