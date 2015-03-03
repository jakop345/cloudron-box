dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('DELETE FROM tokens', [], function (error) {
        if (error) console.error(error);

        db.runSql('ALTER TABLE tokens MODIFY expires BIGINT', [], function (error) {
            if (error) console.error(error);
            callback(error);
        });
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE tokens MODIFY expires VARCHAR(512)', [], function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
