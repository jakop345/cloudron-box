dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE apps DROP COLUMN version', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE apps ADD COLUMN version VARCHAR(32)', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

