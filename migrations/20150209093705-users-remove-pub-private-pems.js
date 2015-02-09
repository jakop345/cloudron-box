var dbm = require('db-migrate');
var type = dbm.dataType;

var async = require('async');

exports.up = function(db, callback) {
    // All that work only because SQLite does not support removing columns...
    db.runSql('ALTER TABLE users RENAME TO users_old', function (error) {
        if (error) return callback(error);

        db.runSql('CREATE TABLE users(' +
            'id VARCHAR(128) NOT NULL UNIQUE,' +
		    'username VARCHAR(512) NOT NULL,' +
		    'email VARCHAR(512) NOT NULL,' +
		    '_password VARCHAR(512) NOT NULL,' +
		    '_salt VARCHAR(512) NOT NULL,' +
		    'createdAt VARCHAR(512) NOT NULL,' +
		    'modifiedAt VARCHAR(512) NOT NULL,' +
		    'admin INTEGER NOT NULL,' +
            'PRIMARY KEY(id));');


        db.all('SELECT * FROM users_old;', function (error, result) {
            if (error) return callback(error);

            async.eachSeries(result, function (record, callback) {
                db.runSql('INSERT INTO users (id, username, email, _password, _salt, createdAt, modifiedAt, admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', record.id, record.username, record.email, record._password, record._salt, record.createdAt, record.modifiedAt, record.admin, callback);
            }, function (error) {
                if (error) return callback(error);

                db.runSql('DROP TABLE users_old', callback);
            });
        });
    });
};

exports.down = function(db, callback) {
    db.runSql('ALTER TABLE users ADD _privatePemCipher VARCHAR(2048)', function (error) {
        if (error) return callback(error);
        db.runSql('ALTER TABLE users ADD publicPem VARCHAR(2048)', callback);
    });
};