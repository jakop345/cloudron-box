var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE apps ADD COLUMN sso BOOLEAN DEFAULT 1', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE apps DROP COLUMN sso', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
