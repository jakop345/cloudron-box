'use strict';

var dbm = global.dbm || require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
	var cmd = 'CREATE TABLE mailboxes(' +
				'id VARCHAR(128) NOT NULL,' +
				'name VARCHAR(128) NOT NULL UNIQUE,' +
				'aliasTarget VARCHAR(128),' +
				'creationTime TIMESTAMP,' +
				'PRIMARY KEY (id))';

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
