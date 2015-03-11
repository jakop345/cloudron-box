dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('DELETE FROM tokens', [], function (error) {
        if (error) console.error(error);

        db.runSql('ALTER TABLE tokens CHANGE userId identifier VARCHAR(128) NOT NULL', [], function (error) {
            if (error) console.error(error);
            callback(error);
        });
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE tokens CHANGE identifier userId VARCHAR(128) NOT NULL', [], function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
