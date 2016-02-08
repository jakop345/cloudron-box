var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    var cmd = "CREATE TABLE groups(" +
                "id VARCHAR(128) NOT NULL UNIQUE," +
                "name VARCHAR(128) NOT NULL UNIQUE," +
                "PRIMARY KEY(id))";

    db.runSql(cmd, function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('DROP TABLE groups', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
