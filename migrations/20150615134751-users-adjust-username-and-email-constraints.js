dbm = dbm || require('db-migrate');
var type = dbm.dataType;
var async = require('async');

exports.up = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE users MODIFY username VARCHAR(254) NOT NULL'),
        db.runSql.bind(db, 'ALTER TABLE users MODIFY email VARCHAR(254) NOT NULL'),
    ], callback);
};

exports.down = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE users MODIFY username VARCHAR(254)'),
        db.runSql.bind(db, 'ALTER TABLE users MODIFY email VARCHAR(254)'),
    ], callback);
};
