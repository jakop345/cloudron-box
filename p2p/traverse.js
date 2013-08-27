var fs = require('fs');
var crypto = require('crypto');

function buildManifest(outer, cb) {
    var walk = function(dir, done) {
        var results = {};
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
                                for (var p in res)
                                    results[p] = res[p];
                                --pendingFiles;
                                if (check())
                                    done(null, results);
                            });
                        } else if (stat.isFile()) {
                            var relative = file.substr(outer.length + 1);
                            ++pendingHashes;
                            results[relative] = {lastModified:stat.mtime};
                            fs.readFile(file, function(err, buf) {
                                if (buf) {
                                    var hash = crypto.createHash('sha256');
                                    hash.update(buf);
                                    results[relative].sha256 = hash.digest().toString("hex");
                                }
                                --pendingHashes;
                                if (check())
                                    done(null, results);
                            });
                            --pendingFiles;
                        }
                    }
                });
            });
        });
    };
    walk(outer, function(err, results) { if (err) { cb(err); } else { cb(results); } });
}

buildManifest(process.cwd(), function(manifest) { console.log("Got manifest " + JSON.stringify(manifest, null, 4)); });

