#!/usr/bin/env node

'use strict';

var dirIndex = require('../lib/dirindex');
var transactions = require('./transactions');
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

    .alias('w', 'fs-watch-delay')
    .describe('w', 'Filesystem watch notification delay to batch changes')
    .string('w')

    .alias('s', 'server')
    .describe('s', 'Backup server address')
    .demand('s')
    .string('s')

    .argv;

console.log('[II] Start client using root', argv.r);
console.log('[II] Loading index...');

var config = {
    rootFolder: argv.r + '/',
    backupServer: argv.s,
    fsWatchDelay: argv.w,
    indexFileName: argv.i || 'index.json'
};

var index = new dirIndex.DirIndex();
var fsWatcher;
var transactionQueue = new transactions.TransactionQueue();


function loadIndex(callback) {
    index.loadFromFile(config.indexFileName, function(error) {
        if (error) {
            console.log('[WW] Unable to load index "' + config.indexFileName + '"', error);
            console.log('[II] Build fresh index...');
        }

        index.update(config.rootFolder, function (error) {
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
    index.save(config.indexFileName, function (error) {
        if (error) {
            console.log('[EE] Unable to save index to disk', error);
        }

        callback();
    });
}

function getRemoteIndex() {
    var requestUrl = config.backupServer + '/dirIndex';
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
            index.update(config.rootFolder, function (error, result) {
                if (error) {
                    console.log('[EE] Unable to update the index', error);
                    return;
                }

                console.log('[II] Index update successful', result);

                result.removed.forEach(function(entry) {
                    transactionQueue.add(new transactions.Transaction('remove', entry, config));
                });
                result.added.forEach(function(entry) {
                    transactionQueue.add(new transactions.Transaction('add', entry, config));
                });
                result.modified.forEach(function(entry) {
                    transactionQueue.add(new transactions.Transaction('update', entry, config));
                });

                transactionQueue.process();
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
