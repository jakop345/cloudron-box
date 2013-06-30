'use strict';

var DirIndex = require('../dirindex').DirIndex,
    readline = require('readline');

var idx = new DirIndex(process.cwd());

setInterval(function () {
    idx.update(function (err, diff) {
        console.log(diff);
    });
}, 2000);

/*
idx.update(function () {
    var idx2 = new DirIndex(process.cwd());

    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('done?', function (answer) {
        rl.close();
        idx2.update(function () {
            console.log(DirIndex.diff(idx, idx2));
            // console.log(idx.entries);
        });
    });
});
*/
