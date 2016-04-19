'use strict';

var dbm = dbm || require('db-migrate');

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE apps ADD COLUMN altDomain VARCHAR(256)', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE apps DROP COLUMN altDomain', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
