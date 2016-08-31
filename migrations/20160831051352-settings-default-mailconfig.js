var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    // everyday at 1am
    db.runSql('INSERT settings (name, value) VALUES("mail_config", ?)', [ JSON.stringify({ enabled: false }) ], callback);
};

exports.down = function(db, callback) {
    db.runSql('DELETE * FROM settings WHERE name="mail_config"', [ ], callback);
};

