#!/usr/bin/env node

'use strict';

var dirIndex = require('../lib/dirindex');
var optimist = require('optimist');
var fs = require('fs');
var request = require('superagent');

var argv = optimist.usage('Usage: $0 --root <directory>')
    .alias('h', 'help')
    .describe('h', 'Show this help.')
    .alias('r', 'root')
    .demand('r')
    .describe('r', 'Sync directory root')
    .string('r')
    .alias('i', 'index')
    .describe('i', 'Directory index file')
    .string('i')
    .alias('s', 'server')
    .describe('s', 'Backup server address')
    .demand('s')
    .string('s')
    .argv;

console.log('[II] Start client using root', argv.r);
console.log('[II] Loading index...');

var indexFileName = argv.i ? argv.i : 'index.json';
var index = new dirIndex.DirIndex();
var rootFolder = argv.r + '/';
var backupServer = argv.s;
var fsWatcher;
var transactions = [];

function loadIndex(callback) {
    index.loadFromFile(indexFileName, function(error) {
        if (error) {
            console.log('[WW] Unable to load index "' + indexFileName + '"', error);
            console.log('[II] Build fresh index...');
        }

        index.update(rootFolder, function (error) {
            if (error) {
                console.log('[EE] Unable to build index. Nothing we can do.', error);
                process.exit(2);
            }

            console.log('[II] Build index successfull.');
            callback();
        });
    });
}

function saveIndex(callback) {
    index.save(indexFileName, function (error) {
        if (error) {
            console.log('[EE] Unable to save index to disk', error);
        }

        callback();
    });
}

function processTransactions() {
    if (!transactions.length) {
        console.log('[II] No pending transactions.');
        return;
    }

    var transaction = transactions.shift();
    console.log('[II] do transaction', transaction);

    var requestUrl = backupServer + '/file';
    var requestObject = {
        action: transaction.action,
        filename: transaction.data.filename
    };

    var postStream = request.post(requestUrl);
    postStream.field('data', JSON.stringify(requestObject));

    if (transaction.action !== 'remove') {
        postStream.attach('file', rootFolder + transaction.data.filename);
    }

    postStream.end(function (res) {
        console.log(res.statusCode);
    });
}

function getRemoteIndex() {
    var requestUrl = backupServer + '/dirIndex';
    console.log('[II] refresh index from server: ' + requestUrl);

    request(requestUrl, function (error, response, body) {
        if (error || response.statusCode !== 200) {
            console.log('[EE] Unable to fetch index from server', error, response.statusCode);
            return;
        }

        var remoteIndex = new dirIndex.DirIndex();
        remoteIndex.loadFromJSON(body, function (error) {
            if (error) {
                console.log('[EE] Unable to parse server index');
                return;
            }

            console.log('index diff', dirIndex.diff(remoteIndex, index));
        });
    });
}

var fsWatchTimer;
function listenToChanges() {
    fsWatcher = fs.watch(argv.r, {}, function (event, filename) {
        if (fsWatchTimer)
            return;

        fsWatchTimer = setTimeout(function () {
            index.update(rootFolder, function (error, result) {
                if (error) {
                    console.log('[EE] Unable to update the index', error);
                    return;
                }
                console.log('[II] Index update successful', result);

                result.removed.forEach(function(entry) {
                    transactions.push({ action: "remove", data: entry });
                });
                result.added.forEach(function(entry) {
                    transactions.push({ action: "add", data: entry });
                });
                result.modified.forEach(function(entry) {
                    transactions.push({ action: "update", data: entry });
                });

                processTransactions();
            });
            fsWatchTimer = undefined;
        }, 2000);
    });
}


// ------ Main
var dirIndexInterval;
loadIndex(function () {
    listenToChanges();

    // dirIndexInterval = setInterval(getRemoteIndex, 2000);
});
