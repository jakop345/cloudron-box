dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE appPortBindings ADD COLUMN environmentVariable VARCHAR(128) NOT NULL', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE appPortBindings DROP COLUMN environmentVariable', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

