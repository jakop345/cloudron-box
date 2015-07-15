dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('INSERT settings (name, value) VALUES("cloudron_name", ?)', [ 'Cloudron' ], callback);
};

exports.down = function(db, callback) {
    db.runSql('DELETE FROM settings WHERE name="cloudron_name"', [ ], callback);
};
