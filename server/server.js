#!/usr/bin/env node

'use strict';

var dirIndex = require('../lib/dirindex');
var optimist = require('optimist');
var express = require('express');

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
    .alias('p', 'port')
    .describe('p', 'Server port')
    .argv;

console.log('[II] Start server using root', argv.r);
console.log('[II] Loading index...');

var indexFileName = argv.i || 'index.json';
var port = argv.p || 3000;
var index = new dirIndex.DirIndex(argv.r);

var app = express();
app.get('/index', function (req, res, next) {
});

app.listen(port);
