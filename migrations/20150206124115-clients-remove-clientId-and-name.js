var dbm = require('db-migrate');
var type = dbm.dataType;

var async = require('async');

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE clients DROP clientId', function (error) {
        if (error) return callback(error);

        db.runSql('ALTER TABLE clients DROP name', function (error) {
            if (error) return callback(error);

            callback(null);
        });
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE clients ADD clientId VARCHAR(512)', function (error) {
        if (error) return callback(error);
        db.runSql('ALTER TABLE clients ADD name VARCHAR(512)', callback);
    });
};
