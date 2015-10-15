dbm = dbm || require('db-migrate');
var type = dbm.dataType;
var async = require('async');

exports.up = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'DELETE FROM clients'),
        db.runSql.bind(db, 'ALTER TABLE clients ADD COLUMN type VARCHAR(16) NOT NULL'),
    ], callback);
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE clients DROP COLUMN type', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
