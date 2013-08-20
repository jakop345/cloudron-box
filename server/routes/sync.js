'use strict';

var debug = require('debug')('sync.js'),
    syncer = require('../syncer.js'),
    HttpError = require('../httperror.js');

exports = module.exports = {
    initialize: initialize,
    diff: diff
};

function initialize(config) {
}

function diff(req, res, next) {
    var repo = req.repo;
    var changes = [ ];

    if (!req.body.index) return next(new HttpError(400, 'Index not provided'));
    if (!('lastSyncRevision' in req.body)) return next(new HttpError(400, 'lastSyncRevision not provided'));

    var index = req.body.index, lastSyncRevision = req.body.lastSyncRevision;

    debug(JSON.stringify(index));
    debug(lastSyncRevision);

    repo.getCommit('HEAD', function (err, headCommit) {
        if (err) return next(new HttpError(500, 'HEAD commit invalid'));
        if (lastSyncRevision == headCommit.sha1) {
            res.send(200, changes);
            return;
        }

        repo.getTree('HEAD', function (err, headTree) {
            if (err) return next(new HttpError(500, 'HEAD tree invalid'));
            repo.getTree(lastSyncRevision, function (err, baseTree) {
                if (err) return next(new HttpError(500, 'Base tree invalid'));

                changes = syncer.diff(index, baseTree, headTree);

                res.send(200, { head: headCommit.sha1, changes: changes });
            });
        });
    });
}

