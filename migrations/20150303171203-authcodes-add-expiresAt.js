dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE authcodes ADD COLUMN expiresAt BIGINT NOT NULL', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE authcodes DROP COLUMN expiresAt', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};