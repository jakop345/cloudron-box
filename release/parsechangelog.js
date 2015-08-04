'use strict';

var fs = require('fs');

exports = module.exports = {
    parse: parse
};

function parse(version) {
    var changelog = [ ];
    var lines = fs.readFileSync(__dirname + '/CHANGES', 'utf8').split('\n');
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] === '[' + version + ']') break;
    }

    for (i = i + 1; i < lines.length; i++) {
        if (lines[i] === '') continue;
        if (lines[i][0] === '[') break;

        lines[i] = lines[i].trim();

        // detect and remove list style - and * in changelog lines
        if (lines[i].indexOf('-') === 0) lines[i] = lines[i].slice(1).trim();
        if (lines[i].indexOf('*') === 0) lines[i] = lines[i].slice(1).trim();

        changelog.push(lines[i]);
    }

    return changelog;
}

