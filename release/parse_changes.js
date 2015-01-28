#!/usr/bin/env node

'use strict';

var fs = require('fs');

var version = process.argv[2];
var lines = fs.readFileSync(__dirname + '/CHANGES', 'utf8').split('\n');
for (var i = 0; i < lines.length; i++) {
    if (lines[i] === '[' + version + ']') break;
}
for (i = i + 1; i < lines.length; i++) {
    if (lines[i] === '') continue;
    if (lines[i][0] === '[') break;
    console.log(lines[i]);
}

