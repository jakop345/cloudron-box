var fs = require('fs');
var crypto = require('crypto');

// var f = {path:file};
// console.log("Reading " + file);
// results[file] = "";
// fs.readFile(file, function(err, buf) {
//     if (buf) {
//         results[file] = crypto.createHash('sha256').digest(buf);
//     }

//     console.log("Reading " + file + " " + (buf ? buf.length : "no buf"));
// });

function buildManifest(outer, cb) {
    var walk = function(dir, done) {
        var results = {};
        // console.log("dir " + dir);
        fs.readdir(dir, function(err, list) {
            if (err)
                return done(err);
            var pendingFiles = list.length;
            if (check())
                return done(null, results);
            var pendingHashes = 0;
            function check() { return !pendingFiles && !pendingHashes; }
            list.forEach(function(file) {
                file = dir + '/' + file;
                fs.stat(file, function(err, stat) {
                    if (stat) {
                        if (stat.isDirectory()) {
                            walk(file, function(err, res) {
                                // console.log("Walking recursively " + file);
                                for (var p in res)
                                    results[p] = res[p];
                                --pendingFiles;
                                if (check())
                                    done(null, results);
                            });
                        } else if (stat.isFile()) {
                            var relative = file.substr(outer.length + 1);
                            ++pendingHashes;
                            var f = {path:file};
                            // console.log("Reading " + file + " " + JSON.stringify(stat));
                            results[relative] = {lastModified:stat.mtime};
                            fs.readFile(file, function(err, buf) {
                                // console.log("Got file callback " + !!buf + " " + pendingHashes);
                                if (buf) {
                                    var hash = crypto.createHash('sha256');
                                    hash.update(buf);
                                    results[relative].sha256 = hash.digest().toString("hex");
                                    // results[relative].length = buf.length;
                                }
                                --pendingHashes;
                                if (check()) {
                                    // console.log("Calling done with " + JSON.stringify(results));
                                    done(null, results);
                                }

                                // console.log("Reading " + file + " " + (buf ? buf.length : "no buf"));
                            });
                            --pendingFiles;
                            // + " " + err + " " + res);
                            // if (check())
                            //     done(null, results);
                        }
                    }
                });
            });
        });
    };
    walk(outer, function(err, results) { console.log("got onDone " + results.length); if (err) { cb(err); } else { cb(results); } });
}

// console.log(process.cwd());
buildManifest(process.cwd(), function(manifest) { console.log("Got manifest " + JSON.stringify(manifest, null, 4)); });

