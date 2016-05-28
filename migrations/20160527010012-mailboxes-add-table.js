'use strict';

var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
	var cmd = 'CREATE TABLE mailboxes(' +
				'name VARCHAR(128) NOT NULL,' +
				'aliasTarget VARCHAR(128),' +
				'creationTime TIMESTAMP,' +
				'PRIMARY KEY (name))';

    db.runSql(cmd, function (error) {
        if (error) console.error(error);
        callback(error);
    });
};

exports.down = function(db, callback) {
    db.runSql('DROP TABLE mailboxes', function (error) {
        if (error) console.error(error);
        callback(error);
    });
};
