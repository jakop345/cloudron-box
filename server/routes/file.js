'use strict';

var fs = require('fs'),
    sync = require('../sync');

exports = module.exports = {
    initialize: initialize,
    listing: listing,
    read: read,
    update: update
};

var sync;

function initialize(config, s) {
    sync = s;
}

function listing(req, res, next) {
    res.send(sync.index.json());
}

function read(req, res, next) {
    var absoluteFilePath = path.join(root, req.params.filename);

    fs.exists(absoluteFilePath, function (exists) {
        if (!exists) return next(new HttpError(404));

        res.sendfile(absoluteFilePath);
    });
}

function update(req, res, next) {
    if (!req.body.data) return next(new HttpError(400, 'data field missing'));
    var data;

    try {
        data = JSON.parse(req.body.data);
    } catch (e) {
        return next(new HttpError(400, 'cannot parse data field:' + e.message));
    }

    if (!data.filename) return next(new HttpError(400, 'filename not specified'));
    if (!data.action) return next(new HttpError(400, 'action not specified'));

    var entry = sync.index.entry(data.filename);
    var absoluteFilePath = path.join(root, data.filename);

    console.log('Processing ', data);

    if (data.action === 'add') {
        if (!req.files.file) return next(new HttpError(400, 'file not provided'));
        if (entry) return next(new HttpError(409, 'File already exists'));

        // make sure the folder exists
        mkdirp(path.dirname(absoluteFilePath), function (error) {
            fs.rename(req.files.file.path, absoluteFilePath, function (err) {
                if (err) return next(new HttpError(500, err.toString()));
                sync.index.addEntry(root, data.filename, function () { res.send('OK'); });
            });
        });
    } else if (data.action === 'remove') {
        if (!entry) return next(new HttpError(404, 'File does not exist'));
        fs.unlink(root + '/' + data.filename, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            sync.index.removeEntry(root, data.filename, function() { res.send('OK'); });
        });
    } else if (data.action === 'update') {
        if (!entry) return next(new HttpError(404, 'File does not exist'));
        if (!req.files.file) return next(new HttpError(400, 'file not provided'));
        if (!data.mtime) return next(new HttpError(400, 'mtime not specified'));
        if (data.mtime < entry.mtime) return next(new HttpError(400, 'Outdated'));
        fs.rename(req.files.file.path, absoluteFilePath, function (err) {
            if (err) return next(new HttpError(500, err.toString()));
            sync.index.updateEntry(root, data.filename, function() { res.send('OK'); });
        });
    } else {
        res.send(new HttpError(400, 'Unknown action'));
    }
}

