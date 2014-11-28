var dbm = require('db-migrate');
var type = dbm.dataType;

exports.up = function(db, callback) {
    db.runSql('CREATE TABLE appAddonConfigs(' +
              ' appId VARCHAR(512) NOT NULL,' +
              ' addonId VARCHAR(32) NOT NULL,' +
              ' value VARCHAR(512) NOT NULL,' +
              ' FOREIGN KEY(appId) REFERENCES apps(id))', callback);
};

exports.down = function(db, callback) {
    db.runSql('DROP TABLE appAddonConfigs', callback);
};

