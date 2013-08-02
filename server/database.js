'use strict';

var fs = require('fs');

var rootDir = '';

exports = module.exports = {
    initializeSync: initializeSync,
    firstTime: firstTime
};

function initializeSync(dbDir) {
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

    rootDir = dbDir;

    return true;
}

function firstTime() {
    return !fs.existsSync(rootDir + '/users');
}

