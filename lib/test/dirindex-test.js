'use strict';

var DirIndex = require('../dirindex').DirIndex,
    readline = require('readline');

var idx = new DirIndex(process.cwd());
idx.build(function () {
    var idx2 = new DirIndex(process.cwd());

    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('done?', function (answer) {
        rl.close();
        idx2.build(function () {
            console.log(DirIndex.diff(idx, idx2));
            // console.log(idx.entries);
        });
    });
});
