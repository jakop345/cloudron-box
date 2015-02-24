var dbm = require('db-migrate');
var type = dbm.dataType;

var async = require('async');

exports.up = function(db, callback) {
    // All that work only because SQLite does not support removing columns...
    db.runSql('ALTER TABLE users DROP _privatePemCipher', function (error) {
        if (error) return callback(error);

        db.runSql('ALTER TABLE users DROP publicPem', function (error) {
            if (error) return callback(error);

            callback(null);
        });
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE users ADD _privatePemCipher VARCHAR(2048)', function (error) {
        if (error) return callback(error);
        db.runSql('ALTER TABLE users ADD publicPem VARCHAR(2048)', callback);
    });
};
