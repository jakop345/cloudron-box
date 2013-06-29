var Index = require('./index').Index,
    readline = require('readline');

var idx = new Index();
idx.build(process.cwd(), function () {
    var idx2 = new Index();

    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('done?', function (answer) {
        rl.close();
        idx2.build(process.cwd(), function () {
            console.log(Index.diff(idx, idx2));
            // console.log(idx.entries);
        });
    });
});
