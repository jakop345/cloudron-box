var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

// imports mailbox entries for existing users
exports.up = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'START TRANSACTION;'),
        function addUserMailboxes(done) {
            db.all('SELECT username FROM users', function (error, results) {
                if (error) return done(error);

                async.eachSeries(results, function (r, next) {
                    if (!r.username) return next();

                    db.runSql('INSERT INTO mailboxes (name) VALUES (?)', [ r.username ], next);
                }, done);
            });
        },
       db.runSql.bind(db, 'COMMIT')
    ], callback);
};

exports.down = function(db, callback) {
  callback();
};
