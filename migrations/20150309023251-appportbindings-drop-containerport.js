dbm = dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('ALTER TABLE appPortBindings DROP COLUMN containerPort', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE appPortBindings ADD COLUMN containerPort VARCHAR(5) NOT NULL', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

