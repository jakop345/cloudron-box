var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE backups CHANGE filename id VARCHAR(128)', [], function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE backups CHANGE id filename VARCHAR(128)', [], function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
