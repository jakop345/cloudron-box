#!/usr/bin/env node

'use strict';

var FileIndex = require('./fileIndex'),
    optimist = require('optimist'),
    fs = require('fs'),
    request = require('superagent'),
    assert = require('assert'),
    debug = require('debug')('client.js'),
    path = require('path');

var argv = optimist.usage('Usage: $0 --root <directory>')
    .alias('h', 'help')
    .describe('h', 'Show this help.')
    .alias('r', 'root')
    .demand('r')
    .describe('r', 'Sync directory root')
    .string('r')
    .alias('s', 'server')
    .describe('s', 'Backup server address')
    .string('s')
    .default('s', 'localhost:3000')
    .alias('a', 'auth')
    .describe('a', 'Authentication (username:password)')
    .demand('a')
    .alias('v', 'volume')
    .describe('v', 'Volume to sync to')
    .demand('v')
    .argv;


var lastSyncRevision = '';

var config = {
    root: path.resolve(argv.r),
    backupServer: argv.s,
    volume: argv.v
};

var fileIndex = new FileIndex(config.root);

// setInterval(index.sync.bind(index, function () { debug('syncing over'); }), 5000);
// index.sync(function () { console.log('again we do'); index.sync(function () { }); });

function updateLastSyncRevision(head) {
    lastSyncRevision = head;
    debug('lastSyncRevision changed to ', lastSyncRevision);
}

function post(path, action, callback) {
    var data = {
        path: path,
        mtime: fileIndex.mtime(path),
        lastSyncRevision: lastSyncRevision,
        action: action
    };

    var postStream = request.post('/api/v1/file/' + path);
    postStream.field('data', JSON.stringify(requestObject));

    if (action !== 'remove') {
        postStream.attach('file', root + path);
    }

    postStream.end(callback);
}

function download(path, callback) {
    var absoluteFilePath = root + path;
    request('/api/v1/file/' + path, function (err, res) {
        if (err || res.statusCode !== 200) {
            debug('Unable to download file', error ? error.code : '', res ? res.statusCode : '');
            return callback();
        }

        var buffer;
        res.on('data', function (data) {
            if (!buffer) buffer = data;
            else buffer += data;
        });

        res.on('end', function () {
            console.log('got end', buffer, absoluteFilePath);

            fs.writeFileSync(absoluteFilePath, buffer);
            callback();
        });
    });
}

function sync(diff, callback) {
    var conflicts = false;

    var changes = diff.changes;

    if (changes.length == 0) {
        updateLastSyncRevision(diff.head);
        return;
    }

    function checkConflict(callback, err, res) {
        if (err) { conflict = true; return callback(null); }
        if (res.body.fastForward) updateLastSyncRevision(data.head);
        callback(null);
    }

    async.eachSeries(changes, function (change, callback) {
        if (change.action == 'add' || change.action == 'update' || change.action == 'remove') {
            post(change.path, changes.action, checkConflict.bind(undefined, callback));
        } else if (change.action == 'unlink') {
            fs.unlink(root.path, function (err) { callback(null); });
        } else if (change.action == 'download') {
            download(change.path, checkConflict.bind(undefined, callback));
        } else {
            console.error('Unknown operation: ', change);
        }
    }, function doneChanges() {
        console.log('done with the changes');
    });
}

fileIndex.sync(function () {
    fileIndex.print();
    request.post(config.backupServer + '/api/v1/sync/' + config.volume + '/diff')
        .set('Authorization', new Buffer(argv.a).toString('base64'))
        .send({ index: fileIndex.jsonObject(), lastSyncRevision: lastSyncRevision })
        .end(function (err, res) {
            if (err) debug(err);
            sync(res.body);
        });
});

