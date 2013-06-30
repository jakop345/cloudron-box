#!/usr/bin/env node

'use strict';

var dirIndex = require('../lib/dirindex');
var optimist = require('optimist');
var fs = require('fs');

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
    .argv;

console.log('[II] Start client using root', argv.r);
console.log('[II] Loading index...');

var indexFileName = argv.i ? argv.i : 'index.json';
var index = new dirIndex.DirIndex(argv.r);
var fsWatcher;

function loadIndex(callback) {
    index.load(indexFileName, function(error) {
        if (error) {
            console.log('[WW] Unable to load index "' + indexFileName + '"', error);
            console.log('[II] Build fresh index...');
        }

        index.update(function (error) {
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

var fsWatchTimer;
function listenToChanges() {
    fsWatcher = fs.watch(argv.r, {}, function (event, filename) {
        if (fsWatchTimer)
            return;

        fsWatchTimer = setTimeout(function () {
            index.update(function (error, result) {
                if (error) {
                    console.log('[EE] Unable to update the index', error);
                    return;
                }
                console.log('[II] Index update successful');
            });
            fsWatchTimer = undefined;
        }, 2000);
    });
}

// ------ Main

loadIndex(function () {
    listenToChanges();
});
