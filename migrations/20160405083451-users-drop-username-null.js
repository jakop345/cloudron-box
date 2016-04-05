dbm = dbm || require('db-migrate');

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE users MODIFY username VARCHAR(254) UNIQUE', [], function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE users MODIFY username VARCHAR(254) NOT NULL UNIQUE', [], function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
