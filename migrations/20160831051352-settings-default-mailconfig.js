var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.all('SELECT * FROM users WHERE admin=1', function (error, results) {
        if (error) return done(error);

        // existing cloudrons have email enabled by default. future cloudrons will have it disabled by default
        var enable = results.length !== 0;
        db.runSql('INSERT settings (name, value) VALUES("mail_config", ?)', [ JSON.stringify({ enabled: enable }) ], callback);
    });
};

exports.down = function(db, callback) {
    db.runSql('DELETE * FROM settings WHERE name="mail_config"', [ ], callback);
};

