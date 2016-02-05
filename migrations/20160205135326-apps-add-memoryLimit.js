dbm = dbm || require('db-migrate');

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE apps ADD COLUMN memoryLimit BIGINT DEFAULT 0', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE apps DROP COLUMN memoryLimit', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
