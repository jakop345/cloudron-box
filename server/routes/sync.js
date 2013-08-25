'use strict';

var debug = require('debug')('sync.js'),
    syncer = require('../syncer.js'),
    HttpError = require('../httperror.js'),
    util = require('util');

exports = module.exports = {
    initialize: initialize,
    diff: diff
};

function initialize(config) {
}

function diff(req, res, next) {
    var repo = req.repo;

    if (!('index' in req.body)) return next(new HttpError(400, 'Index not provided'));
    if (!('lastSyncRevision' in req.body)) return next(new HttpError(400, 'lastSyncRevision not provided'));

    var index = req.body.index, lastSyncRevision = req.body.lastSyncRevision;

    debug(util.inspect(index));
    debug(lastSyncRevision);

    repo.getCommit('HEAD', function (err, headCommit) {
        if (err) return next(new HttpError(500, 'HEAD commit invalid'));
        repo.getTree('HEAD', function (err, headTree) {
            if (err) return next(new HttpError(500, 'HEAD tree invalid'));
            repo.getTree(lastSyncRevision, function (err, baseTree) {
                if (err) return next(new HttpError(500, 'Base tree invalid'));

                var changes = syncer.diff(index, baseTree, headTree);
                debug(util.inspect(changes));
                res.send(200, { serverRevision: headCommit.sha1, changes: changes });
            });
        });
    });
}

