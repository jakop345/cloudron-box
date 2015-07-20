dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE users ADD COLUMN resetToken VARCHAR(128) DEFAULT ""', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE users DROP COLUMN resetToken', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

