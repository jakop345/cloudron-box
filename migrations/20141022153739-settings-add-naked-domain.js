var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('INSERT INTO settings (key, value) VALUES (?, ?)', [ 'naked_domain', null ], callback);
};

exports.down = function(db, callback) {
    db.runSql('DELETE FROM settings WHERE key=?', [ 'naked_domain' ], callback);
};
