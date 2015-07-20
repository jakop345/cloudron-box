dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    // everyday at 1am
    db.runSql('INSERT settings (name, value) VALUES("autoupdate_pattern", ?)', [ '00 00 1 * * *' ], callback);
};

exports.down = function(db, callback) {
    db.runSql('DELETE * FROM settings WHERE name="autoupdate_pattern"', [ ], callback);
}

