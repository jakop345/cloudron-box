var dbm = require('db-migrate');
var type = dbm.dataType;

var constants = require('../constants.js');

exports.up = function(db, callback) {
    db.runSql('INSERT settings (name, value) VALUES("naked_domain", ?)', [ constants.ADMIN_LOCATION ], callback);
};

exports.down = function(db, callback) {
    db.runSql('DELETE * FROM settings WHERE name="naked_domain"', [ ], callback);
};
