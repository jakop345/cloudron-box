var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

// imports mailbox entries for existing users and apps
exports.up = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'START TRANSACTION;'),
        function addUserMailboxes(done) {
            db.all('SELECT username FROM users', function (error, results) {
                if (error) return done(error);

                console.dir(results);

                async.eachSeries(results, function (r, next) {
                    db.runSql('INSERT INTO mailboxes (name) VALUES (?)', [ r.username ], next);
                }, done);
            });
        },
        function addAppMailboxes(done) {
            db.all('SELECT location, manifestJson FROM apps', function (error, results) {
                if (error) return done(error);

                console.dir(results);

                async.eachSeries(results, function (r, next) {
                    var app = { location: r.location, manifest: JSON.parse(r.manifestJson) };
                    var from = (app.location ? app.location : app.manifest.title.replace(/[^a-zA-Z0-9]/, '')) + '.app';
                    db.runSql('INSERT INTO mailboxes (name) VALUES (?)', [ from ], next);
                }, done);
            });
        },
        db.runSql.bind(db, 'COMMIT')
    ], callback);
};

exports.down = function(db, callback) {
  callback();
};
