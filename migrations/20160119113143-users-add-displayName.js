dbm = dbm || require('db-migrate');

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE users ADD COLUMN displayName VARCHAR(512) DEFAULT ""', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE users DROP COLUMN displayName', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
