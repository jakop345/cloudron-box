var dbm = require('db-migrate');
var type = dbm.dataType;

var uuid = require('node-uuid');

exports.up = function(db, callback) {
    var scopes = 'root,profile,users,apps,settings,roleAdmin';
    var adminOrigin = 'https://admin-localhost';

    db.runSql('INSERT INTO clients (id, appId, clientId, clientSecret, name, redirectURI, scope) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?)', [ uuid.v4(), 'webadmin', 'cid-webadmin', 'unused', 'WebAdmin', adminOrigin, scopes ],
              callback);
};

exports.down = function(db, callback) {
    // not sure what is meaningful here
    callback(null);
};
