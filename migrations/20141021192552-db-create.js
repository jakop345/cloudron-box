var dbm = require('db-migrate');
var type = dbm.dataType;
var url = require('url');

exports.up = function(db, callback) {
    var dbName = url.parse(process.env.DATABASE_URL).path.substr(1); // remove slash

    // by default, mysql collates case insensitively. 'utf8_general_cs' is not available
    db.runSql('ALTER DATABASE ' + dbName + '  DEFAULT CHARACTER SET=utf8 DEFAULT COLLATE utf8_bin', callback);
};

exports.down = function(db, callback) {
    callback();
};
