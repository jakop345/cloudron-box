'use strict';

var DirIndex = require('../dirindex').DirIndex,
    readline = require('readline');

var idx = new DirIndex();
idx.build(process.cwd(), function () {
    var idx2 = new DirIndex();

    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('done?', function (answer) {
        rl.close();
        idx2.build(process.cwd(), function () {
            console.log(DirIndex.diff(idx, idx2));
            // console.log(idx.entries);
        });
    });
});
