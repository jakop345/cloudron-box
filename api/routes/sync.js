'use strict';

var debug = require('debug')('server:routes/sync'),
    syncer = require('../syncer'),
    HttpError = require('../httperror'),
    HttpSuccess = require('../httpsuccess'),
    util = require('util');

exports = module.exports = {
    initialize: initialize,
    diff: diff,
    delta: delta
};

function initialize(config) {
}

function diff(req, res, next) {
    var repo = req.volume.repo;

    if (!('index' in req.body)) return next(new HttpError(400, 'Index not provided'));
    if (!('lastSyncRevision' in req.body)) return next(new HttpError(400, 'lastSyncRevision not provided'));

    var clientIndex = req.body.index, lastSyncRevision = req.body.lastSyncRevision;

    debug(util.inspect(clientIndex));
    debug(lastSyncRevision);

    repo.getCommit('HEAD', function (err, headCommit) {
        if (err) return next(new HttpError(500, 'HEAD commit invalid'));
        repo.indexEntries(function (err, serverIndex) {
            if (err) return next(new HttpError(500, 'HEAD tree invalid'));
            repo.getTree(lastSyncRevision, function (err, baseTree) {
                if (err) return next(new HttpError(500, 'Base tree invalid'));

                var changes = syncer.diffEntries(clientIndex, baseTree.entries, serverIndex);
                debug(util.inspect(changes));
                next(new HttpSuccess(200, { serverRevision: headCommit.sha1, changes: changes }));
            });
        });
    });
}

 /**
 * @api {post} /api/v1/sync/:volume/delta delta
 * @apiName delta
 * @apiGroup volume
 * @apiDescription
 * Outputs the delta operations required to sync with the server.
 *
 * The change object contains:
 *   <code>oldRev, rev, oldMode, mode, status, oldPath, path</code>
 *
 * status is a character which is one of
 *   <code>A (added), C (copied), D (deleted), M (modified), R (renamed), T (mode changed)</code>
 *
 * @apiParam {string} clientRevision The current volume revision on the client.
 *
 * @apiSuccess {Object[]} changes Array of changes needed to be performed by the syncer client.
 * @apiSuccess {String} serverRevision The current revision of this volume on the server.
 *
 * @apiError 422 Invalid Cursor
 * @apiError 500 HEAD commit invalid
 */
function delta(req, res, next) {
    var repo = req.volume.repo;
    var clientRevision = req.query.clientRevision || '';

    repo.getCommit('HEAD', function (err, headCommit) {
        if (err) return next(new HttpError(500, 'HEAD commit invalid'));
        repo.diffTree(clientRevision, headCommit.sha1, function (err, changes) {
            if (err) return next(new HttpError(422, 'invalid cursor'));
            next(new HttpSuccess(200, { changes: changes, serverRevision: headCommit.sha1 }));
        });
    });
}

