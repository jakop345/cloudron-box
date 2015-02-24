var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('UPDATE settings SET value="admin" WHERE name="naked_domain" AND (value IS null OR value = "")', [ ], callback);
};

exports.down = function(db, callback) {
    db.runSql('UPDATE settings SET value=NULL WHERE name="naked_domain" AND value="admin"', [ ], callback);
};
