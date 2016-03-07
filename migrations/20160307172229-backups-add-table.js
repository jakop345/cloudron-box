var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    var cmd = "CREATE TABLE backups(" +
            "filename VARCHAR(128) NOT NULL," +
            "creationTime TIMESTAMP," +
            "version VARCHAR(128) NOT NULL," +
            "type VARCHAR(16) NOT NULL," +
            "dependsOn VARCHAR(4096)," +
            "state VARCHAR(16) NOT NULL," +
            "PRIMARY KEY (filename))";

    db.runSql(cmd, function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('DROP TABLE backups', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
