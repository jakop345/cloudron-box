var dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE backups DROP COLUMN configJson', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE backups ADD COLUMN configJson TEXT', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

