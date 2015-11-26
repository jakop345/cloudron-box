dbm = dbm || require('db-migrate');
var type = dbm.dataType;
var async = require('async');

exports.up = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE apps MODIFY accessRestrictionJson TEXT'),
        db.runSql.bind(db, 'ALTER TABLE apps MODIFY lastBackupConfigJson TEXT'),
        db.runSql.bind(db, 'ALTER TABLE apps MODIFY oldConfigJson TEXT')
    ], callback);
};

exports.down = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE apps MODIFY accessRestrictionJson VARCHAR(2048)'),
        db.runSql.bind(db, 'ALTER TABLE apps MODIFY lastBackupConfigJson VARCHAR(2048)'),
        db.runSql.bind(db, 'ALTER TABLE apps MODIFY oldConfigJson VARCHAR(2048)')
    ], callback);
};
