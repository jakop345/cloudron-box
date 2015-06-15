dbm = dbm || require('db-migrate');
var type = dbm.dataType;
var async = require('async');

exports.up = function(db, callback) {

    // http://stackoverflow.com/questions/386294/what-is-the-maximum-length-of-a-valid-email-address

    async.series([
        db.runSql.bind(db, 'ALTER TABLE users MODIFY username VARCHAR(254)'),
        db.runSql.bind(db, 'ALTER TABLE users ADD CONSTRAINT users_username UNIQUE (username)'),
        db.runSql.bind(db, 'ALTER TABLE users MODIFY email VARCHAR(254)'),
        db.runSql.bind(db, 'ALTER TABLE users ADD CONSTRAINT users_email UNIQUE (email)'),
    ], callback);
};

exports.down = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE users DROP INDEX users_username'),
        db.runSql.bind(db, 'ALTER TABLE users MODIFY username VARCHAR(512)'),
        db.runSql.bind(db, 'ALTER TABLE users DROP INDEX users_email'),
        db.runSql.bind(db, 'ALTER TABLE users MODIFY email VARCHAR(512)'),
    ], callback);
};
